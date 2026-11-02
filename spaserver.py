import http.server, functools, os
class H(http.server.SimpleHTTPRequestHandler):
    def send_head(self):
        path = self.translate_path(self.path)
        if not os.path.exists(path.split('?')[0]) and not self.path.startswith('/assets'):
            self.path = '/index.html'
        return super().send_head()
    def log_message(self,*a): pass
http.server.ThreadingHTTPServer(('127.0.0.1',8377), H).serve_forever()
