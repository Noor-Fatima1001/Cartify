from django.db.models import Q

def get_paginated_data(queryset, request, search_fields=None, status_field=None, default_limit=10):
    # Search
    search_query = request.query_params.get('search', '').strip()
    if search_query and search_fields:
        q_obj = Q()
        for field in search_fields:
            q_obj |= Q(**{f"{field}__icontains": search_query})
        queryset = queryset.filter(q_obj)
        
    # Status
    status_query = request.query_params.get('status', '').strip().upper()
    if status_query and status_query != 'ALL' and status_field:
        if status_field == 'status':
            queryset = queryset.filter(status=status_query)
        elif status_field == 'is_active':
            is_active_val = (status_query == 'ACTIVE')
            queryset = queryset.filter(is_active=is_active_val)
        elif status_field == 'kyc':
            queryset = queryset.filter(vendor_profile__kyc_status=status_query)
        else:
            queryset = queryset.filter(**{status_field: status_query})
            
    # Sorting
    sort_query = request.query_params.get('sort', '').strip()
    if hasattr(queryset, 'model') and queryset.model.__name__ == 'Product':
        # Sort by is_premium first (premium products first), then by creation date
        if sort_query:
            queryset = queryset.order_by('-is_premium', sort_query)
        else:
            existing_ordering = list(queryset.query.order_by)
            if existing_ordering:
                if '-is_premium' not in existing_ordering and 'is_premium' not in existing_ordering:
                    queryset = queryset.order_by('-is_premium', *existing_ordering)
            else:
                queryset = queryset.order_by('-is_premium', '-created_at')
    else:
        if sort_query:
            queryset = queryset.order_by(sort_query)
        
    # Pagination
    try:
        page = int(request.query_params.get('page', 1))
    except (ValueError, TypeError):
        page = 1
        
    try:
        limit = int(request.query_params.get('limit', default_limit))
    except (ValueError, TypeError):
        limit = default_limit
        
    total_items = queryset.count()
    total_pages = max(1, (total_items + limit - 1) // limit)
    
    # Clamp page
    if page < 1:
        page = 1
    elif page > total_pages:
        page = total_pages
        
    start = (page - 1) * limit
    end = start + limit
    
    paginated_queryset = queryset[start:end]
    
    return {
        'queryset': paginated_queryset,
        'total_items': total_items,
        'total_pages': total_pages,
        'current_page': page,
        'limit': limit
    }
