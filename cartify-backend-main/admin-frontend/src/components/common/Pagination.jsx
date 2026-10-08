import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const Pagination = ({ currentPage, totalPages, onPageChange, totalItems }) => {
    if (totalPages <= 1) return null;

    const renderPageNumbers = () => {
        const pages = [];
        for (let i = 1; i <= totalPages; i++) {
            if (
                i === 1 ||
                i === totalPages ||
                (i >= currentPage - 1 && i <= currentPage + 1)
            ) {
                pages.push(
                    <button
                        key={i}
                        className={`page-btn ${i === currentPage ? 'active' : ''}`}
                        onClick={() => onPageChange(i)}
                    >
                        {i}
                    </button>
                );
            } else if (
                i === currentPage - 2 ||
                i === currentPage + 2
            ) {
                pages.push(<span key={i} className="pagination-ellipsis">...</span>);
            }
        }
        return pages;
    };

    return (
        <div className="pagination-container">
            <div className="pagination-controls">
                <button
                    className="page-btn"
                    disabled={currentPage === 1}
                    onClick={() => onPageChange(currentPage - 1)}
                >
                    <ChevronLeft />
                </button>
                {renderPageNumbers()}
                <button
                    className="page-btn"
                    disabled={currentPage === totalPages}
                    onClick={() => onPageChange(currentPage + 1)}
                >
                    <ChevronRight />
                </button>
            </div>
            {totalItems && (
                <div className="pagination-info">
                    Total: <span>{totalItems}</span>
                </div>
            )}
        </div>
    );
};

export default Pagination;
