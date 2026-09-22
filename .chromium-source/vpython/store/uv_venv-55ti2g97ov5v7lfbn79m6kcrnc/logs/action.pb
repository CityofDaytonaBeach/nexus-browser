{
  "name":  "uv_venv",
  "metadata":  {
    "runtimeDeps":  [
      {
        "name":  "cpython",
        "copy":  {
          "files":  {
            ".":  {
              "mode":  2147484159,
              "version":  "{\n  \"package_name\": \"infra/3pp/tools/cpython3/windows-amd64\",\n  \"instance_id\": \"rsTWTQSjphDXCHCxvVjct-dX_2HKWP84RUyz5DwKpCEC\"\n}",
              "local":  {
                "path":  "C:\\Users\\AV\\Documents\\GitHub\\nexus-browser\\.chromium-source\\depot_tools\\.cipd_bin\\3.11",
                "followSymlinks":  true
              }
            }
          }
        }
      }
    ]
  },
  "deps":  [
    {
      "name":  "bootstrap",
      "copy":  {
        "files":  {
          "bootstrap.py":  {
            "mode":  292,
            "version":  "6b68be914d3e9046c7193b7e85636dd0a36f1d1b599cc3a22cd948a1c14d1692",
            "embed":  {
              "ref":  "626f6f7473747261706b68be914d3e9046c7193b7e85636dd0a36f1d1b599cc3a22cd948a1c14d1692",
              "path":  "bootstrap.py"
            }
          },
          "pep425tags.py":  {
            "mode":  292,
            "version":  "6b68be914d3e9046c7193b7e85636dd0a36f1d1b599cc3a22cd948a1c14d1692",
            "embed":  {
              "ref":  "626f6f7473747261706b68be914d3e9046c7193b7e85636dd0a36f1d1b599cc3a22cd948a1c14d1692",
              "path":  "pep425tags.py"
            }
          },
          "uv_bootstrap.py":  {
            "mode":  292,
            "version":  "6b68be914d3e9046c7193b7e85636dd0a36f1d1b599cc3a22cd948a1c14d1692",
            "embed":  {
              "ref":  "626f6f7473747261706b68be914d3e9046c7193b7e85636dd0a36f1d1b599cc3a22cd948a1c14d1692",
              "path":  "uv_bootstrap.py"
            }
          }
        }
      }
    },
    {
      "name":  "cpython",
      "copy":  {
        "files":  {
          ".":  {
            "mode":  2147484159,
            "version":  "{\n  \"package_name\": \"infra/3pp/tools/cpython3/windows-amd64\",\n  \"instance_id\": \"rsTWTQSjphDXCHCxvVjct-dX_2HKWP84RUyz5DwKpCEC\"\n}",
            "local":  {
              "path":  "C:\\Users\\AV\\Documents\\GitHub\\nexus-browser\\.chromium-source\\depot_tools\\.cipd_bin\\3.11",
              "followSymlinks":  true
            }
          }
        }
      }
    },
    {
      "name":  "uv",
      "copy":  {
        "files":  {
          ".":  {
            "mode":  2147484159,
            "version":  "uv",
            "local":  {
              "path":  "C:\\Users\\AV\\Documents\\GitHub\\nexus-browser\\.chromium-source\\depot_tools\\.cipd_bin\\uv",
              "followSymlinks":  true
            }
          }
        }
      }
    },
    {
      "name":  "vpython_requirements",
      "copy":  {
        "files":  {
          "requirements.txt":  {
            "mode":  292,
            "raw":  "YnJvdGxpPT0xLjAuOSA7IHB5dGhvbl9mdWxsX3ZlcnNpb24gPj0gJzMuMTInIG9yIHBsYXRmb3JtX21hY2hpbmUgIT0gJ3Jpc2N2NjQnIG9yIHN5c19wbGF0Zm9ybSAhPSAnbGludXgnCmNlcnRpZmk9PTIwMjEuNS4zMApjaGFyc2V0LW5vcm1hbGl6ZXI9PTIuMC40CmNvbG9yYW1hPT0wLjQuNgpjb3ZlcmFnZT09Ny4xMy4wCmhqc29uPT0zLjEuMApodHRwbGliMj09MC4xMy4xCmlkbmE9PTIuOAppbmljb25maWc9PTIuMS4wCmx4bWw9PTQuOS4zCnBhY2thZ2luZz09MjUuMApwYXJhbWV0ZXJpemVkPT0wLjguMQpwbHVnZ3k9PTEuNi4wCnB5Z21lbnRzPT0yLjE5LjIKcHl0ZXN0PT05LjAuMgpweXRlc3QtY292PT02LjIuMQpweXRlc3QtbW9jaz09My4xMC4wCnB5dGhvbi1kYXRldXRpbD09Mi43LjMKcHl5YW1sPT01LjQuMStjaHJvbWl1bS4xCnJlcXVlc3RzPT0yLjMxLjAKc2l4PT0xLjEwLjAKc3FscGFyc2U9PTAuNC40CnRvbWxpPT0yLjEuMCA7IHB5dGhvbl9mdWxsX3ZlcnNpb24gPD0gJzMuMTEnCnR6ZGF0YT09MjAyMy40CnVybGxpYjM9PTEuMjYuNgo="
          }
        }
      }
    }
  ],
  "command":  {
    "args":  [
      "{{.cpython}}\\bin\\python3.exe",
      "-BsE",
      "{{.bootstrap}}\\uv_bootstrap.py",
      "--uv-bin",
      "{{.uv}}\\uv.exe",
      "--python-bin",
      "{{.cpython}}\\bin\\python3.exe",
      "--req-file",
      "{{.vpython_requirements}}\\requirements.txt"
    ],
    "env":  [
      "VPYTHON_AR_URL=https://us-python.pkg.dev/chrome-python-ar/chrome-python-ar/simple/",
      "bootstrap={{.bootstrap}}",
      "cpython={{.cpython}}",
      "depsHostTarget={{.bootstrap}};{{.cpython}};{{.uv}};{{.vpython_requirements}}",
      "uv={{.uv}}",
      "vpython_requirements={{.vpython_requirements}}"
    ]
  }
}