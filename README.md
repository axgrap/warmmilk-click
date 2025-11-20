# warmmilk-click

A static site generator for creating temporal project views with complete git history tracking.

## Overview

This system generates a static website that presents projects with temporal views, allowing you to:
- Track all commits and their messages for each project
- View commits specific to `click.md` files in each project
- Analyze line-by-line blame history going back to the origin of files
- Traverse repository timelines

**Projects can be:**
- Local subdirectories in the `projects/` folder, OR
- **External git repositories** (recommended) - See [EXTERNAL_PROJECTS.md](EXTERNAL_PROJECTS.md) for setup

## Features

### Temporal Data Model
- **Complete Commit History**: Captures all commits with SHA, author, email, date, message, and changed files
- **Click.md Tracking**: Specifically tracks commits on `click.md` files in each project
- **Blame History**: Records complete blame information for each line, including:
  - Line ranges
  - Commit that introduced each line
  - Author and date information
  - Original line numbers in the commit
  - Line content
- **Asset Management**: Automatically extracts and copies all images referenced in `click.md` files to the `dist/assets` directory
- **External Repository Support**: Each project can be a separate git repository with its own history

### Static Site Generation
- Automatically builds in GitHub Actions
- Triggered by commits to this repo or via repository_dispatch from project repos
- Three main views:
  1. **Projects View**: Overview of all projects and their statistics
  2. **All Commits**: Complete commit history for each repository
  3. **Temporal View**: Line-by-line blame history showing evolution over time
- Images from `click.md` files are automatically copied to `dist/assets` for serving
- Deploys to GitHub Pages automatically

### Client Library
- JavaScript/TypeScript client library for navigating the temporal data model
- Provides easy-to-use API for querying projects, commits, blame history, and image versions
- Can be used in browser or Node.js
- See [CLIENT_LIBRARY.md](CLIENT_LIBRARY.md) for full documentation and examples

## Project Structure

```
.
├── projects/              # Projects directory
│   └── example/          # Example project
│       └── click.md      # Special file tracked for temporal views
├── scripts/              
│   └── generate-temporal-data.py  # Script to extract git history
├── src/
│   └── model.json        # JSON schema for the temporal data model
├── .github/
│   └── workflows/
│       └── static-site.yml  # GitHub Actions workflow
└── dist/                 # Generated static site (created during build)
    ├── temporal-data.json
    └── index.html
```

## Getting Started

### Option 1: Using External Git Repositories (Recommended)

This allows each project to be its own repository with full git history.

See [EXTERNAL_PROJECTS.md](EXTERNAL_PROJECTS.md) for complete setup instructions.

**Quick start:**
1. Edit `projects.yml` and add your repositories:
   ```yaml
   projects:
     - name: my-project
       repository: your-username/your-repo
   ```

2. Add a `click.md` file to your project repository

3. Set up automatic rebuild triggers (see EXTERNAL_PROJECTS.md)

### Option 2: Local Projects (Simple Setup)

For quick testing or simple use cases, you can use local project directories.

1. Create a new directory under `projects/`:
   ```bash
   mkdir projects/my-project
   ```

2. Add a `click.md` file to your project:
   ```bash
   echo "# My Project" > projects/my-project/click.md
   ```

3. (Optional) Add images to your project:
   ```bash
   mkdir projects/my-project/images
   # Add your images to the images directory
   ```
   
   Then reference them in your `click.md`:
   ```markdown
   ![Description](images/my-image.png)
   ```
   
   The build process will automatically copy all referenced images to `dist/assets`.

4. Commit and push your changes:
   ```bash
   git add projects/my-project/click.md
   git commit -m "Add my-project"
   git push
   ```

The GitHub Actions workflow will automatically generate the temporal data and deploy the updated site.

### Running Locally

You can generate the temporal data locally:

```bash
python3 scripts/generate-temporal-data.py . dist/temporal-data.json
```

Then open `dist/index.html` in a browser (you may need to serve it with a local server due to CORS):

```bash
cd dist
python3 -m http.server 8000
# Open http://localhost:8000 in your browser
```

## Data Model

The generated `temporal-data.json` follows a structured schema (see `src/model.json`):

```json
{
  "projects": [
    {
      "name": "example",
      "path": "projects/example",
      "commits": [...],  // All repository commits
      "clickFile": {
        "path": "projects/example/click.md",
        "commits": [...],  // Commits that modified click.md
        "blameHistory": [...],  // Line-by-line blame info
        "currentContent": "..."
      }
    }
  ],
  "metadata": {
    "generatedAt": "2025-11-20T00:00:00Z",
    "version": "1.0.0"
  }
}
```

## GitHub Actions Workflow

The workflow (`./github/workflows/static-site.yml`) runs on:
- Push to `main` or `master` branch
- Manual workflow dispatch

It performs the following steps:
1. Checks out the repository with full history
2. Runs the Python script to generate temporal data
3. Creates an HTML interface
4. Deploys to GitHub Pages

## Enabling GitHub Pages

To enable GitHub Pages for your repository:

1. Go to Settings → Pages
2. Under "Build and deployment", select "GitHub Actions" as the source
3. The site will be deployed automatically on the next push

## Requirements

- Python 3.11+ (for running the generation script)
- Git repository with history
- GitHub Actions enabled (for automatic deployment)

## License

This project is open source and available under the MIT License.