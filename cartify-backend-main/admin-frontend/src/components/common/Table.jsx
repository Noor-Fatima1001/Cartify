import React from 'react';
import Pagination from './Pagination';
import { SkeletonTableRows } from './Skeleton';

const Table = ({
    columns,
    data,
    renderRow,
    keyExtractor,
    currentPage = 1,
    totalPages = 1,
    onPageChange,
    totalItems,
    loading = false,
    noDataMessage = 'No data available',
}) => {
    return (
        <div className="table-container">
            <table>
                <thead>
                    <tr>
                        {columns.map((column, index) => (
                            <th key={index}>{column}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {loading ? (
                        <SkeletonTableRows rows={Math.min(6, Math.max(3, data?.length || 5))} columns={columns.length} />
                    ) : data && data.length > 0 ? (
                        data.map((item, rowIndex) => (
                            <tr key={keyExtractor ? keyExtractor(item) : rowIndex}>
                                {renderRow(item)}
                            </tr>
                        ))
                    ) : (
                        <tr>
                            <td colSpan={columns.length} className="dash-empty">
                                {noDataMessage}
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
            {totalPages > 1 && (
                <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={onPageChange}
                    totalItems={totalItems}
                />
            )}
        </div>
    );
};

export default Table;
