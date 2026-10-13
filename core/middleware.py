class GlobalLoginRequiredMiddleware():
    """
    Middleware that forces unauthenticated users to redirect to /login/ 
    for all web dashboard routes unless explicitly exempted.
    """
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        #Paths that must remain  accessible without having to login
        exempt_paths = [
            '/login/',
            '/logout/',
            '/api/auth/login/',
            '/api/auth/refresh/',
            '/static/',
            '/media/',
        ]
        #Check if the requested path starts with any exempt path
        path= request.path_info
        is_exempt = any(path.startswith(url) for url in exempt_paths)

        # Web authentication is JWT-based and lives in the client.  API views
        # enforce JWT authentication through DRF; session authentication must
        # not turn an API 401 into an HTML redirect.
        return self.get_response(request)


    




