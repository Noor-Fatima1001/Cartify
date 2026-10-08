export const ANALYTICS_PAGE_SIZE = 5;

export const normalizeAnalyticsPagination = (response, fallbackPage = 1, fallbackLimit = ANALYTICS_PAGE_SIZE) => {
    const results = Array.isArray(response?.results) ? response.results : [];
    const totalCount = Number(
        response?.count ??
        response?.total_items ??
        response?.total_count ??
        results.length
    );

    const totalPages = Number(
        response?.total_pages ??
        (totalCount > 0 ? Math.ceil(totalCount / (response?.limit ?? fallbackLimit)) : 1)
    );

    return {
        results,
        totalPages: Number.isFinite(totalPages) && totalPages > 0 ? totalPages : 1,
        totalItems: Number.isFinite(totalCount) ? totalCount : results.length,
        currentPage: Number(response?.current_page ?? response?.page ?? fallbackPage),
    };
};
