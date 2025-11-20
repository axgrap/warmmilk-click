# Setting Up External Project Repositories

This guide explains how to configure external git repositories as projects for the warmmilk-click temporal view system.

## Overview

Each project can be a separate git repository. When commits are made to any project repository, this repository will automatically rebuild the static site with updated temporal data.

## Configuration

### 1. Configure Projects in projects.yml

Edit `projects.yml` in this repository to list your external project repositories:

```yaml
projects:
  - name: my-project
    repository: axgrap/my-project-repo
    branch: main  # optional, defaults to the default branch
  
  - name: another-project
    repository: axgrap/another-repo
```

**Important:** 
- Each external repository must have a `click.md` file (at the root or in a subdirectory)
- The repositories must be public, or you need to configure authentication (see below)

### 2. Set Up Repository Dispatch Trigger

To trigger automatic rebuilds when you push to your project repositories, add a GitHub Actions workflow to each project repository:

Create `.github/workflows/notify-warmmilk-click.yml` in each project repository:

```yaml
name: Notify Warmmilk Click

on:
  push:
    branches:
      - main  # or whatever branch you want to track

jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
      - name: Repository Dispatch
        run: |
          curl -X POST \
            -H "Accept: application/vnd.github.v3+json" \
            -H "Authorization: token ${{ secrets.DISPATCH_TOKEN }}" \
            https://api.github.com/repos/axgrap/warmmilk-click/dispatches \
            -d '{"event_type":"project-updated"}'
```

### 3. Create a Personal Access Token (PAT)

1. Go to GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Click "Generate new token (classic)"
3. Give it a descriptive name like "warmmilk-click-dispatch"
4. Select the following scopes:
   - `repo` (Full control of private repositories) - needed to trigger repository_dispatch
5. Click "Generate token" and copy the token

### 4. Add the Token to Each Project Repository

For each project repository:

1. Go to the repository Settings → Secrets and variables → Actions
2. Click "New repository secret"
3. Name: `DISPATCH_TOKEN`
4. Value: Paste the personal access token you created
5. Click "Add secret"

## Manual Trigger

You can also manually trigger a rebuild:

1. Go to the warmmilk-click repository
2. Navigate to Actions → Generate Static Site
3. Click "Run workflow"
4. Select the branch and click "Run workflow"

## Private Repositories

If your project repositories are private, you need to configure authentication for the checkout step:

### Option 1: Use a Personal Access Token

1. Create a PAT with `repo` scope (as described above)
2. Add it as a secret in the warmmilk-click repository:
   - Name: `PROJECTS_ACCESS_TOKEN`
   - Value: Your PAT

3. Update `projects.yml` to use the token:

```yaml
projects:
  - name: my-private-project
    repository: axgrap/my-private-repo
    branch: main
    use_token: true  # This tells the workflow to use PROJECTS_ACCESS_TOKEN
```

4. The workflow will automatically use this token for authentication

### Option 2: Use Deploy Keys (per repository)

For more granular access control, you can use deploy keys for each private repository. This is more secure but requires more setup.

## Testing

After configuration:

1. Make a commit to one of your project repositories
2. Check the Actions tab in the warmmilk-click repository
3. You should see a new workflow run triggered by the repository dispatch
4. Once complete, your project should appear on the generated site

## Troubleshooting

### "Repository not found" error
- Check that the repository name in `projects.yml` is correct
- For private repos, ensure authentication is properly configured

### "click.md not found" warning
- Verify that your project repository has a `click.md` file
- Check the file name (case-sensitive)

### Workflow not triggering
- Verify the repository dispatch workflow is in place in your project repo
- Check that the `DISPATCH_TOKEN` secret is set correctly
- Ensure the token has the `repo` scope

### Images not loading
- Ensure image paths in `click.md` are relative to the file
- Images must be in the same repository as `click.md`

## Example Project Structure

### External Project Repository Structure:
```
my-project-repo/
├── .github/
│   └── workflows/
│       └── notify-warmmilk-click.yml
├── click.md
├── images/
│   └── diagram.png
└── README.md
```

### Example click.md:
```markdown
# My Project

![Architecture Diagram](images/diagram.png)

## Overview

This project demonstrates temporal tracking...
```

When this repository is committed to, it will:
1. Trigger the notify workflow
2. Send a repository_dispatch event to warmmilk-click
3. Cause warmmilk-click to rebuild with the latest content
4. Copy `images/diagram.png` to the static site assets
