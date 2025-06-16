import axios from 'axios';

export interface ICompany {
  id: number;
  company_name: string;
  liked: boolean;
}

export interface ICollection {
  id: string;
  collection_name: string;
  companies: ICompany[];
  total: number;
}

export interface ICompanyBatchResponse {
  companies: ICompany[];
}

export interface IOperationProgress {
  progress: number;
  status: string;
}

const BASE_URL = 'http://localhost:8000';

export async function getCompanies(
  offset?: number,
  limit?: number
): Promise<ICompanyBatchResponse> {
  try {
    const response = await axios.get(`${BASE_URL}/companies`, {
      params: {
        offset,
        limit,
      },
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching companies:', error);
    throw error;
  }
}

export async function getCollectionsById(
  id: string,
  offset?: number,
  limit?: number
): Promise<ICollection> {
  try {
    const response = await axios.get(`${BASE_URL}/collections/${id}`, {
      params: {
        offset,
        limit,
      },
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching companies:', error);
    throw error;
  }
}

export async function getCollectionsMetadata(): Promise<ICollection[]> {
  try {
    const response = await axios.get(`${BASE_URL}/collections`);
    return response.data;
  } catch (error) {
    console.error('Error fetching companies:', error);
    throw error;
  }
}

export async function copyCollectionCompanies(
  sourceId: string,
  targetId: string,
  companyIds?: number[]
): Promise<{ operation_id: string }> {
  try {
    const endpoint = companyIds
      ? `${BASE_URL}/collections/${sourceId}/move-to/${targetId}`
      : `${BASE_URL}/collections/${sourceId}/copy-to/${targetId}`;

    console.log('Making API call to:', endpoint);
    console.log('With data:', companyIds ? { company_ids: companyIds } : null);

    const response = await axios.post(
      endpoint,
      companyIds ? { company_ids: companyIds } : null
    );
    return response.data;
  } catch (error) {
    console.error('Error copying companies:', error);
    throw error;
  }
}
export async function getOperationProgress(
  operationId: string
): Promise<IOperationProgress> {
  try {
    const response = await axios.get(
      `${BASE_URL}/collections/operation-progress/${operationId}`
    );
    return response.data;
  } catch (error) {
    console.error('Error getting operation progress:', error);
    throw error;
  }
}
