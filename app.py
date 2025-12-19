import streamlit as st
import os
import socket
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import time

st.set_page_config(page_title="AirWrite", layout="wide")

# Define the directory to serve
DIST_DIR = os.path.join(os.getcwd(), "dist")

def find_free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("", 0))
        return s.getsockname()[1]

# Use st.cache_resource to ensure the server runs only once
@st.cache_resource
def start_server():
    if not os.path.exists(DIST_DIR):
        return None, f"Build directory '{DIST_DIR}' not found. Please run 'npm run build'."
    
    port = find_free_port()
    
    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=DIST_DIR, **kwargs)
        
        # Quiet logs
        def log_message(self, format, *args):
            pass

    server = ThreadingHTTPServer(("localhost", port), Handler)
    
    # Start server in a background thread
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    
    return port, None

def main():
    if not os.path.exists(DIST_DIR):
        st.error(f"Build artifacts not found at {DIST_DIR}. Please run 'npm run build'.")
        return

    port, error = start_server()
    
    if error:
        st.error(error)
        return

    app_url = f"http://localhost:{port}"
    
    # Display the app in an iframe
    # height=900 matches the previous config
    st.components.v1.iframe(app_url, height=900, scrolling=True)
    
    # Optional: Debug info (can be removed)
    # st.caption(f"Serving app from {app_url}")

if __name__ == "__main__":
    main()
