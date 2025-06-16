# Welcome to the Harmonic Fullstack Jam! :D

Please familiarize yourself with any docs provided to you before continuing.

In this repo, you'll find 2 deployable services:

1. Backend - dockerized deployable that will spin up a Python backend with FastAPI, Postgres SQL DB and some seeded data.
2. Frontend - locally deployable app via Vite with TypeScript/React

Please refer to the individual READMEs in the respective repos to get started!

Enjoy :D

# Company Collection Management System

## Overview

A system for managing company collections with features to move companies between "My List" and "Liked Companies" collections. Supports individual and bulk operations with progress tracking.

## Technical Stack

- Frontend: React, TypeScript, Tailwind CSS, Material-UI DataGrid
- Backend: Python (FastAPI)
- State: React Hooks
- Notifications: react-hot-toast

## Key Features

- View companies in paginated table
- Search companies by name
- Move individual/selected companies between collections
- Bulk copy entire collections
- Real-time progress tracking
- Error handling with toast notifications

## Batch Processing Implementation

```python
# Backend (collections.py)
async def copy_companies_background(source_id, target_id, operation_id, total_companies, db):
    batch_size = 200  # Optimized from initial 50
    processed = 0

    while processed < total_companies:
        # Fetch companies in batches
        companies = db.query(...).offset(processed).limit(batch_size).all()

        # Check for duplicates
        existing = {assoc.company_id for assoc in db.query(...).filter(...).all()}

        # Create new associations
        new_associations = [
            CompanyCollectionAssociation(company_id=assoc.company_id, collection_id=target_id)
            for assoc in companies
            if assoc.company_id not in existing
        ]

        # Bulk save
        if new_associations:
            db.bulk_save_objects(new_associations)
            db.commit()

        processed += len(companies)
        update_progress(operation_id, processed/total_companies)
        await asyncio.sleep(0.1)  # Throttle
```

## Trade-offs

### Batch Size: 200

- Pros: Fewer DB transactions, faster overall
- Cons: Less frequent progress updates, higher memory per batch

### Throttling (0.1s)

- Pros: Prevents DB overload, stable performance
- Cons: Slightly slower processing

## API Endpoints

```python
# Key endpoints:
- GET /collections/{id} - Fetch collection companies
- POST /collections/{id}/companies - Add companies to collection
- POST /collections/{id}/copy - Copy companies between collections
- GET /operations/{id}/progress - Track operation progress
```

## Technical Decisions & Tradeoffs

### 1. State Management

- Used React's built-in state management instead of external libraries
- Tradeoff: Simpler implementation but might need refactoring for larger scale

### 2. Search Implementation

- Client-side filtering for immediate feedback
- Tradeoff: Limited to current page data, might need server-side search for large datasets

### 3. Progress Tracking

- Polling-based progress updates
- Tradeoff: Network overhead vs real-time updates

## Assumptions

1. **Data Volume**

   - Assumed moderate dataset size (thousands of companies)
   - Current pagination (25 items) might need adjustment for larger datasets

2. **User Behavior**

   - Users primarily work with current page data
   - Bulk operations are less frequent than individual selections

3. **Performance**
   - Network latency is acceptable for progress polling
   - Client-side filtering is sufficient for current data volume

## Next Steps

### High Priority

1. **Error Handling and Recovery**

   - [ ] Implement comprehensive error tracking
   - [ ] Add error recovery strategies
   - [ ] Enhance error reporting
   - [ ] Add error analytics

2. **Performance Optimizations**
   - [ ] Implement data caching
   - [ ] Add request batching
   - [ ] Optimize large dataset handling
   - [ ] Add performance monitoring

## Conclusion

The current implementation provides a solid foundation for company collection management. The focus has been on user experience and reliable operation handling. Future improvements should focus on scalability, performance optimization, and additional features to enhance user productivity.

## API Documentation

### Collections API

```typescript
interface ICompany {
  id: string;
  company_name: string;
  liked: boolean;
}

interface IOperationProgress {
  progress: number;
  status: 'in_progress' | 'completed' | 'error';
}

getCollectionsById(id: string, offset: number, pageSize: number): Promise<{companies: ICompany[], total: number}>
copyCollectionCompanies(sourceId: string, targetId: string, companyIds?: string[]): Promise<{operation_id: string}>
getOperationProgress(operationId: string): Promise<IOperationProgress>
```
