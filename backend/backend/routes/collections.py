import asyncio
import uuid
from typing import Dict

from fastapi import (APIRouter, BackgroundTasks, Body, Depends, HTTPException,
                     Query)
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.db import database
from backend.routes.companies import (CompanyBatchOutput,
                                      fetch_companies_with_liked)

router = APIRouter(
    prefix="/collections",
    tags=["collections"],
)


class CompanyCollectionMetadata(BaseModel):
    id: uuid.UUID
    collection_name: str


class CompanyCollectionOutput(CompanyBatchOutput, CompanyCollectionMetadata):
    pass

class AddCompaniesRequest(BaseModel):
    company_ids: list[int]


@router.get("", response_model=list[CompanyCollectionMetadata])
def get_all_collection_metadata(
    db: Session = Depends(database.get_db),
):
    collections = db.query(database.CompanyCollection).all()

    return [
        CompanyCollectionMetadata(
            id=collection.id,
            collection_name=collection.collection_name,
        )
        for collection in collections
    ]


@router.get("/{collection_id}", response_model=CompanyCollectionOutput)
def get_company_collection_by_id(
    collection_id: uuid.UUID,
    offset: int = Query(
        0, description="The number of items to skip from the beginning"
    ),
    limit: int = Query(10, description="The number of items to fetch"),
    db: Session = Depends(database.get_db),
):
    query = (
        db.query(database.CompanyCollectionAssociation, database.Company)
        .join(database.Company)
        .filter(database.CompanyCollectionAssociation.collection_id == collection_id)
    )

    total_count = query.with_entities(func.count()).scalar()

    results = query.offset(offset).limit(limit).all()
    companies = fetch_companies_with_liked(db, [company.id for _, company in results])

    return CompanyCollectionOutput(
        id=collection_id,
        collection_name=db.query(database.CompanyCollection)
        .get(collection_id)
        .collection_name,
        companies=companies,
        total=total_count,
    )

@router.post("/{collection_id}/companies", response_model=CompanyCollectionOutput)
def add_companies_to_collection(
    collection_id: uuid.UUID,
    request: AddCompaniesRequest,
    db: Session = Depends(database.get_db)
):
    print("Received request:", request)  
    print("Company IDs:", request.company_ids) 
    
    collection = db.query(database.CompanyCollection).get(collection_id)
    if not collection:
        raise HTTPException(status_code=404, detail="Collection not found")
    
    # Get existing associations to avoid duplicates
    existing_associations = {
        assoc.company_id 
        for assoc in db.query(database.CompanyCollectionAssociation)
        .filter(database.CompanyCollectionAssociation.collection_id == collection_id)
        .all()
    }
    
    print("Existing associations:", existing_associations)  
    
    # Only create associations for companies that aren't already in the collection
    new_associations = [
        database.CompanyCollectionAssociation(
            company_id=company_id,
            collection_id=collection_id,
        )
        for company_id in request.company_ids
        if company_id not in existing_associations
    ]
    
    print("New associations to create:", new_associations)
    
    if new_associations:
        try:
            db.bulk_save_objects(new_associations)
            db.commit()
        except IntegrityError as e:
            db.rollback()
            raise HTTPException(status_code=400, detail=str(e))
    
    return get_company_collection_by_id(collection_id, offset=0, limit=10, db=db)

# Store for tracking operation progress
operation_progress: Dict[str, float] = {}

class OperationResponse(BaseModel):
    operation_id: str

class OperationProgress(BaseModel):
    progress: float
    status: str 

@router.post("/{source_id}/copy-to/{target_id}", response_model=OperationResponse)
async def copy_collection_companies(
    source_id: uuid.UUID,
    target_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    db: Session = Depends(database.get_db)
):
    operation_id = str(uuid.uuid4())
    operation_progress[operation_id] = 0.0

    total_companies = (
        db.query(database.CompanyCollectionAssociation)
        .filter(database.CompanyCollectionAssociation.collection_id == source_id)
        .count()
    )

    background_tasks.add_task(
        copy_companies_background,
        source_id,
        target_id,
        operation_id,
        total_companies,
        db
    )

    return OperationResponse(operation_id=operation_id)

async def copy_companies_background(
    source_id: uuid.UUID,
    target_id: uuid.UUID,
    operation_id: str,
    total_companies: int,
    db: Session
):
    try:
        batch_size = 200
        processed = 0

        # Get the Liked Companies List ID
        liked_list = (
            db.query(database.CompanyCollection)
            .filter(database.CompanyCollection.collection_name == "Liked Companies List")
            .first()
        )
        if not liked_list:
            raise Exception("Liked Companies List not found")

        while processed < total_companies:
            companies = (
                db.query(database.CompanyCollectionAssociation)
                .filter(database.CompanyCollectionAssociation.collection_id == source_id)
                .offset(processed)
                .limit(batch_size)
                .all()
            )

            if not companies:
                break

            existing_associations = {
                assoc.company_id 
                for assoc in db.query(database.CompanyCollectionAssociation)
                .filter(database.CompanyCollectionAssociation.collection_id == target_id)
                .filter(database.CompanyCollectionAssociation.company_id.in_([c.company_id for c in companies]))
                .all()
            }

            new_associations = [
                database.CompanyCollectionAssociation(
                    company_id=assoc.company_id,
                    collection_id=target_id
                )
                for assoc in companies
                if assoc.company_id not in existing_associations
            ]

            if new_associations:
                try:
                    db.bulk_save_objects(new_associations)
                    db.commit()
                except IntegrityError:
                    db.rollback()
                    pass

            # Update liked status
            if target_id == liked_list.id:
                # Moving to Liked Companies List
                for company in companies:
                    existing = (
                        db.query(database.CompanyCollectionAssociation)
                        .filter(database.CompanyCollectionAssociation.collection_id == liked_list.id)
                        .filter(database.CompanyCollectionAssociation.company_id == company.company_id)
                        .first()
                    )
                    if not existing:
                        db.add(database.CompanyCollectionAssociation(
                            company_id=company.company_id,
                            collection_id=liked_list.id
                        ))
            else:
                # Moving from Liked Companies List
                for company in companies:
                    existing = (
                        db.query(database.CompanyCollectionAssociation)
                        .filter(database.CompanyCollectionAssociation.collection_id == liked_list.id)
                        .filter(database.CompanyCollectionAssociation.company_id == company.company_id)
                        .first()
                    )
                    if existing:
                        db.delete(existing)

            try:
                db.commit()
            except IntegrityError:
                db.rollback()
                pass

            processed += len(companies)
            operation_progress[operation_id] = (processed / total_companies) * 100

            await asyncio.sleep(0.1)

        operation_progress[operation_id] = 100.0

    except Exception as e:
        operation_progress[operation_id] = -1.0
        raise e
    finally:
        await asyncio.sleep(300)
        if operation_id in operation_progress:
            del operation_progress[operation_id]

@router.get("/operation-progress/{operation_id}", response_model=OperationProgress)
def get_operation_progress(operation_id: str):
    if operation_id not in operation_progress:
        raise HTTPException(status_code=404, detail="Operation not found")
    
    progress = operation_progress[operation_id]
    status = "completed" if progress == 100 else "error" if progress == -1 else "in_progress"
    
    return OperationProgress(progress=progress, status=status)

@router.post("/{source_id}/move-to/{target_id}", response_model=OperationResponse)
async def move_collection_companies(
    source_id: uuid.UUID,
    target_id: uuid.UUID,
    request: AddCompaniesRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(database.get_db)
):
    operation_id = str(uuid.uuid4())
    operation_progress[operation_id] = 0.0

    total_companies = len(request.company_ids)
    background_tasks.add_task(
        move_companies_background,
        source_id,
        target_id,
        request.company_ids,
        operation_id,
        total_companies,
        db
    )

    return OperationResponse(operation_id=operation_id)

async def move_companies_background(
    source_id: uuid.UUID,
    target_id: uuid.UUID,
    company_ids: list[int],
    operation_id: str,
    total_companies: int,
    db: Session
):
    try:
        processed = 0
        batch_size = 200

        # Get the Liked Companies List ID
        liked_list = (
            db.query(database.CompanyCollection)
            .filter(database.CompanyCollection.collection_name == "Liked Companies List")
            .first()
        )
        if not liked_list:
            raise Exception("Liked Companies List not found")

        for i in range(0, len(company_ids), batch_size):
            batch = company_ids[i:i + batch_size]
            
            # Verify companies are in source collection
            source_associations = (
                db.query(database.CompanyCollectionAssociation)
                .filter(database.CompanyCollectionAssociation.collection_id == source_id)
                .filter(database.CompanyCollectionAssociation.company_id.in_(batch))
                .all()
            )
            
            valid_company_ids = {assoc.company_id for assoc in source_associations}
            
            # Get existing associations in target
            existing_associations = {
                assoc.company_id 
                for assoc in db.query(database.CompanyCollectionAssociation)
                .filter(database.CompanyCollectionAssociation.collection_id == target_id)
                .filter(database.CompanyCollectionAssociation.company_id.in_(valid_company_ids))
                .all()
            }
            
            # Create new associations
            new_associations = [
                database.CompanyCollectionAssociation(
                    company_id=company_id,
                    collection_id=target_id
                )
                for company_id in valid_company_ids
                if company_id not in existing_associations
            ]
            
            if new_associations:
                try:
                    db.bulk_save_objects(new_associations)
                    db.commit()
                except IntegrityError:
                    db.rollback()
                    pass

            # Update liked status
            if target_id == liked_list.id:
                # Moving to Liked Companies List
                for company_id in valid_company_ids:
                    existing = (
                        db.query(database.CompanyCollectionAssociation)
                        .filter(database.CompanyCollectionAssociation.collection_id == liked_list.id)
                        .filter(database.CompanyCollectionAssociation.company_id == company_id)
                        .first()
                    )
                    if not existing:
                        db.add(database.CompanyCollectionAssociation(
                            company_id=company_id,
                            collection_id=liked_list.id
                        ))
            else:
                # Moving from Liked Companies List
                for company_id in valid_company_ids:
                    existing = (
                        db.query(database.CompanyCollectionAssociation)
                        .filter(database.CompanyCollectionAssociation.collection_id == liked_list.id)
                        .filter(database.CompanyCollectionAssociation.company_id == company_id)
                        .first()
                    )
                    if existing:
                        db.delete(existing)

            # Remove from source collection
            for company_id in valid_company_ids:
                source_assoc = (
                    db.query(database.CompanyCollectionAssociation)
                    .filter(database.CompanyCollectionAssociation.collection_id == source_id)
                    .filter(database.CompanyCollectionAssociation.company_id == company_id)
                    .first()
                )
                if source_assoc:
                    db.delete(source_assoc)

            try:
                db.commit()
            except IntegrityError:
                db.rollback()
                pass
            
            processed += len(batch)
            operation_progress[operation_id] = (processed / total_companies) * 100
            
            await asyncio.sleep(0.1)
        
        operation_progress[operation_id] = 100.0
        
    except Exception as e:
        operation_progress[operation_id] = -1.0
        raise e
    finally:
        await asyncio.sleep(300)
        if operation_id in operation_progress:
            del operation_progress[operation_id]