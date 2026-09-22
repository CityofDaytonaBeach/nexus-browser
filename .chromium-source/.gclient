solutions = [
  {
    "name": "devtools-frontend",
    "url": "https://chromium.googlesource.com/devtools/devtools-frontend.git",
    "deps_file": "DEPS",
    "custom_vars": {
      "non_git_source": False,
    },
    "custom_deps": {
      "devtools-frontend/third_party/chrome/chrome-win": None,
    },
  },
]
