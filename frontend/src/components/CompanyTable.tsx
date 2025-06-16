import { DataGrid } from '@mui/x-data-grid';
import { useEffect, useState } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import {
  getCollectionsById,
  ICompany,
  copyCollectionCompanies,
  getOperationProgress,
} from '../utils/jam-api';
import { useDebounce } from 'use-debounce';

const TableSkeleton = () => (
  <div className="animate-pulse">
    <div className="h-10 bg-gray-200 rounded mb-4" />
    {[...Array(5)].map((_, i) => (
      <div key={i} className="h-12 bg-gray-200 rounded mb-2" />
    ))}
  </div>
);

const CompanyTable = (props: {
  selectedCollectionId: string;
  likedCompaniesId: string | undefined;
  myListId: string | undefined;
  onCollectionUpdate?: () => void;
}) => {
  const {
    selectedCollectionId,
    likedCompaniesId,
    myListId,
    onCollectionUpdate,
  } = props;
  const isLikedCompanies = selectedCollectionId === likedCompaniesId;
  const [response, setResponse] = useState<ICompany[]>([]);
  const [total, setTotal] = useState<number>();
  const [offset, setOffset] = useState<number>(0);
  const [pageSize, setPageSize] = useState(25);
  const [selectedRows, setSelectedRows] = useState<ICompany[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [operationId, setOperationId] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch] = useDebounce(searchQuery, 300);
  const [filteredResponse, setFilteredResponse] = useState<ICompany[]>([]);

  const targetCollectionId = isLikedCompanies ? myListId! : likedCompaniesId!;
  const targetCollectionName = isLikedCompanies ? 'My List' : 'Liked Companies';

  const handleAddSelectedToTarget = async () => {
    if (selectedRows.length === 0) {
      toast.error('Please select at least one company');
      return;
    }

    // Check if any selected company is already in target list
    const alreadyInTarget = selectedRows.some(
      (row) => row.liked === !isLikedCompanies
    );
    if (alreadyInTarget) {
      toast.error(
        `One or more selected companies are already in ${targetCollectionName}`
      );
      return;
    }

    try {
      setIsLoading(true);
      const { operation_id } = await copyCollectionCompanies(
        selectedCollectionId,
        targetCollectionId,
        selectedRows.map((row) => row.id)
      );
      setOperationId(operation_id);
      toast.success(
        `Moving ${selectedRows.length} companies to ${targetCollectionName}...`
      );
    } catch (error) {
      toast.error(
        `Failed to add selected companies to ${targetCollectionName}`
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyAllToTarget = async () => {
    setShowConfirmModal(true);
  };

  const handleConfirmCopy = async () => {
    setShowConfirmModal(false);
    try {
      setIsLoading(true);
      const { operation_id } = await copyCollectionCompanies(
        selectedCollectionId,
        targetCollectionId
      );
      setOperationId(operation_id);
      toast.success(`Moving all companies to ${targetCollectionName}...`);
    } catch (error) {
      toast.error(`Failed to copy all companies to ${targetCollectionName}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Update progress polling effect
  useEffect(() => {
    if (!operationId || !likedCompaniesId || !myListId) return;

    const pollProgress = async () => {
      try {
        const { progress, status } = await getOperationProgress(operationId);
        setProgress(progress);

        if (status === 'completed') {
          setResponse((prevResponse) =>
            prevResponse.map((company) => {
              if (selectedRows.some((row) => row.id === company.id)) {
                return {
                  ...company,
                  liked: !isLikedCompanies,
                };
              }
              return company;
            })
          );
          setOperationId(null);
          setProgress(0);
          setSelectedRows([]);
          toast.success(
            `Successfully moved companies to ${targetCollectionName}!`
          );
          onCollectionUpdate?.();
        } else if (status === 'error') {
          toast.error('Operation failed');
          setOperationId(null);
          setProgress(0);
        }
      } catch (error) {
        toast.error('Failed to get progress');
        setOperationId(null);
        setProgress(0);
      }
    };

    const interval = setInterval(pollProgress, 1000);
    return () => clearInterval(interval);
  }, [
    operationId,
    likedCompaniesId,
    myListId,
    selectedRows,
    isLikedCompanies,
    onCollectionUpdate,
    targetCollectionName,
  ]);

  useEffect(() => {
    if (debouncedSearch) {
      const filtered = response.filter((company) =>
        company.company_name
          .toLowerCase()
          .includes(debouncedSearch.toLowerCase())
      );
      setFilteredResponse(filtered);
    } else {
      setFilteredResponse(response);
    }
  }, [debouncedSearch, response]);

  useEffect(() => {
    setIsLoading(true);
    getCollectionsById(selectedCollectionId, offset, pageSize).then(
      (newResponse) => {
        setResponse(newResponse.companies);
        setFilteredResponse(newResponse.companies);
        setTotal(newResponse.total);
        setIsLoading(false);
      }
    );
  }, [selectedCollectionId, offset, pageSize]);

  useEffect(() => {
    setOffset(0);
  }, [selectedCollectionId]);

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Ctrl/Cmd + Enter to confirm
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        if (showConfirmModal) {
          handleConfirmCopy();
        }
      }
      // Escape to close modal
      if (e.key === 'Escape') {
        setShowConfirmModal(false);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [showConfirmModal]);

  if (isLoading) {
    return <TableSkeleton />;
  }

  if (!likedCompaniesId || !myListId) {
    return null;
  }

  return (
    <div>
      <Toaster
        position="bottom-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: '#333',
            color: '#fff',
          },
          success: {
            duration: 2000,
            iconTheme: {
              primary: '#4ade80',
              secondary: '#fff',
            },
          },
          error: {
            duration: 4000,
            iconTheme: {
              primary: '#ef4444',
              secondary: '#fff',
            },
          },
        }}
      />

      <div className="mb-4 flex gap-4 items-center">
        {selectedRows.length > 0 && (
          <div className="relative group">
            <button
              onClick={handleAddSelectedToTarget}
              disabled={isLoading || !!operationId}
              className={`px-4 py-2 rounded-md flex items-center gap-2 ${
                isLoading || operationId
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-[#F87315] hover:bg-[#F87315]/80 text-white'
              }`}>
              {isLoading && (
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
              )}
              {isLoading
                ? 'Starting...'
                : `Add Selected to ${targetCollectionName}`}
            </button>
            <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-1 bg-gray-800 text-white text-sm rounded opacity-0 group-hover:opacity-100 transition-opacity">
              Move selected companies to {targetCollectionName}
            </div>
          </div>
        )}

        <button
          onClick={handleCopyAllToTarget}
          disabled={isLoading || !!operationId}
          className={`px-4 py-2 rounded-md flex items-center gap-2 ${
            isLoading || operationId
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-[#F87315] hover:bg-[#F87315]/80 text-white'
          }`}>
          {isLoading && (
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          )}
          {isLoading ? 'Starting...' : `Copy All to ${targetCollectionName}`}
        </button>

        {operationId && (
          <div className="flex-1 flex items-center gap-2">
            <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-sm text-gray-600">
              {Math.round(progress)}%
            </span>
          </div>
        )}

        {/* Search input */}
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search companies..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Confirm Action</h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to copy all companies to{' '}
              {targetCollectionName}?
            </p>
            <div className="flex justify-end gap-4">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 text-white bg-[#F87315] rounded hover:bg-[#F87315]/80">
                Cancel
              </button>
              <button
                onClick={handleConfirmCopy}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ height: 600, width: '100%' }}>
        <DataGrid
          rows={filteredResponse}
          rowHeight={30}
          columns={[
            { field: 'liked', headerName: 'Liked', width: 90 },
            { field: 'id', headerName: 'ID', width: 90 },
            { field: 'company_name', headerName: 'Company Name', width: 200 },
          ]}
          initialState={{
            pagination: {
              paginationModel: { page: 0, pageSize: 25 },
            },
          }}
          rowCount={total}
          pagination
          checkboxSelection
          paginationMode="server"
          onRowSelectionModelChange={(newSelection) => {
            setSelectedRows(
              response.filter((row) => newSelection.includes(row.id))
            );
          }}
          onPaginationModelChange={(newMeta) => {
            setPageSize(newMeta.pageSize);
            setOffset(newMeta.page * newMeta.pageSize);
          }}
        />
      </div>

      {error && (
        <div className="fixed bottom-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          <span className="block sm:inline">{error}</span>
          <button
            className="absolute top-0 bottom-0 right-0 px-4 py-3"
            onClick={() => setError(null)}>
            <span className="sr-only">Dismiss</span>
            <svg
              className="fill-current h-6 w-6 text-red-500"
              role="button"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20">
              <title>Close</title>
              <path d="M14.348 14.849a1.2 1.2 0 0 1-1.697 0L10 11.819l-2.651 3.029a1.2 1.2 0 1 1-1.697-1.697l2.758-3.15-2.759-3.152a1.2 1.2 0 1 1 1.697-1.697L10 8.183l2.651-3.031a1.2 1.2 0 1 1 1.697 1.697l-2.758 3.152 2.758 3.15a1.2 1.2 0 0 1 0 1.698z" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
};

export default CompanyTable;
