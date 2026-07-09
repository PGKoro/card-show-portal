from rest_framework.pagination import PageNumberPagination


class DefaultPagination(PageNumberPagination):
    """
    Same page size as before (20) unless the client asks for a different
    one via ?page_size= — the admin list tools (vendor approvals, manage
    roles, manage events) use this to show 5 at a time.
    """

    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100
