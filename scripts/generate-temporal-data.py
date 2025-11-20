#!/usr/bin/env python3
"""
Script to extract git history and generate temporal data model for projects.
This script traverses the repository, finds all projects with click.md files,
and generates a JSON file with complete commit history and blame information.
"""

import json
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Dict, Any, Optional, Set


def run_git_command(cmd: List[str], cwd: Optional[str] = None) -> str:
    """Run a git command and return its output."""
    try:
        result = subprocess.run(
            cmd,
            cwd=cwd,
            capture_output=True,
            text=True,
            check=True
        )
        return result.stdout.strip()
    except subprocess.CalledProcessError as e:
        print(f"Error running git command {' '.join(cmd)}: {e.stderr}", file=sys.stderr)
        return ""


def get_all_commits(repo_path: str) -> List[Dict[str, Any]]:
    """Get all commits in the repository."""
    commits = []
    
    # Get commit info with format: SHA|AUTHOR|EMAIL|DATE|MESSAGE
    log_format = "%H|%an|%ae|%aI|%s"
    output = run_git_command(
        ["git", "log", f"--pretty=format:{log_format}", "--all"],
        cwd=repo_path
    )
    
    if not output:
        return commits
    
    for line in output.split('\n'):
        if not line:
            continue
        parts = line.split('|', 4)
        if len(parts) == 5:
            sha, author, email, date, message = parts
            
            # Get files changed in this commit
            files_output = run_git_command(
                ["git", "diff-tree", "--no-commit-id", "--name-only", "-r", sha],
                cwd=repo_path
            )
            files = [f for f in files_output.split('\n') if f]
            
            commits.append({
                "sha": sha,
                "author": author,
                "email": email,
                "date": date,
                "message": message,
                "files": files
            })
    
    return commits


def get_click_file_commits(repo_path: str, click_file_path: str) -> List[Dict[str, Any]]:
    """Get all commits that modified the click.md file."""
    commits = []
    
    # Get commit info for specific file
    log_format = "%H|%an|%ae|%aI|%s"
    output = run_git_command(
        ["git", "log", f"--pretty=format:{log_format}", "--follow", "--", click_file_path],
        cwd=repo_path
    )
    
    if not output:
        return commits
    
    for line in output.split('\n'):
        if not line:
            continue
        parts = line.split('|', 4)
        if len(parts) == 5:
            sha, author, email, date, message = parts
            commits.append({
                "sha": sha,
                "author": author,
                "email": email,
                "date": date,
                "message": message
            })
    
    return commits


def get_blame_history(repo_path: str, click_file_path: str) -> List[Dict[str, Any]]:
    """Get complete blame information for each line in the click.md file."""
    blame_info = []
    
    # Check if file exists
    full_path = os.path.join(repo_path, click_file_path)
    if not os.path.exists(full_path):
        return blame_info
    
    # Use git blame with porcelain format for detailed info
    output = run_git_command(
        ["git", "blame", "--line-porcelain", click_file_path],
        cwd=repo_path
    )
    
    if not output:
        return blame_info
    
    lines = output.split('\n')
    i = 0
    current_line = 1
    
    while i < len(lines):
        if not lines[i]:
            i += 1
            continue
            
        # First line contains: SHA original_line current_line [num_lines]
        parts = lines[i].split()
        if len(parts) < 3:
            i += 1
            continue
            
        sha = parts[0]
        original_line = int(parts[1])
        
        # Parse the following metadata lines
        author = ""
        email = ""
        date = ""
        content = ""
        
        i += 1
        while i < len(lines) and not lines[i].startswith('\t'):
            if lines[i].startswith('author '):
                author = lines[i][7:]
            elif lines[i].startswith('author-mail '):
                email = lines[i][12:].strip('<>')
            elif lines[i].startswith('author-time '):
                timestamp = int(lines[i][12:])
                date = datetime.fromtimestamp(timestamp).isoformat() + 'Z'
            i += 1
        
        # Content line starts with tab
        if i < len(lines) and lines[i].startswith('\t'):
            content = lines[i][1:]
            i += 1
        
        blame_info.append({
            "lineStart": current_line,
            "lineEnd": current_line,
            "commit": sha,
            "author": author,
            "email": email,
            "date": date,
            "content": content,
            "originalLineStart": original_line
        })
        
        current_line += 1
    
    return blame_info


def get_current_content(repo_path: str, click_file_path: str) -> str:
    """Get the current content of the click.md file."""
    full_path = os.path.join(repo_path, click_file_path)
    if os.path.exists(full_path):
        with open(full_path, 'r', encoding='utf-8') as f:
            return f.read()
    return ""


def extract_image_references(markdown_content: str) -> Set[str]:
    """Extract all image references from markdown content."""
    images = set()
    
    # Match markdown image syntax: ![alt](path)
    markdown_pattern = r'!\[([^\]]*)\]\(([^)]+)\)'
    for match in re.finditer(markdown_pattern, markdown_content):
        image_path = match.group(2)
        # Skip external URLs
        if not image_path.startswith(('http://', 'https://', '//')):
            images.add(image_path)
    
    # Match HTML img tags: <img src="path">
    html_pattern = r'<img[^>]+src=["\']([^"\']+)["\']'
    for match in re.finditer(html_pattern, markdown_content):
        image_path = match.group(1)
        # Skip external URLs
        if not image_path.startswith(('http://', 'https://', '//')):
            images.add(image_path)
    
    return images


def get_image_history(repo_path: str, image_path: str) -> List[Dict[str, Any]]:
    """Get the commit history for a specific image file."""
    history = []
    
    # Check if the file exists
    full_path = os.path.join(repo_path, image_path)
    if not os.path.exists(full_path):
        return history
    
    # Get commit info for the image file with format: SHA|AUTHOR|EMAIL|DATE|MESSAGE
    log_format = "%H|%an|%ae|%aI|%s"
    output = run_git_command(
        ["git", "log", f"--pretty=format:{log_format}", "--follow", "--", image_path],
        cwd=repo_path
    )
    
    if not output:
        return history
    
    for line in output.split('\n'):
        if not line:
            continue
        parts = line.split('|', 4)
        if len(parts) == 5:
            sha, author, email, date, message = parts
            
            # Get file size at this commit
            size_output = run_git_command(
                ["git", "show", f"{sha}:{image_path}"],
                cwd=repo_path
            )
            file_size = len(size_output.encode()) if size_output else 0
            
            history.append({
                "sha": sha,
                "author": author,
                "email": email,
                "date": date,
                "message": message,
                "size": file_size
            })
    
    return history


def copy_images_to_assets(repo_path: str, project_path: str, project_git_root: str, image_refs: Set[str], assets_dir: str) -> List[Dict[str, Any]]:
    """Copy images referenced in click.md to the assets directory and track their history."""
    copied_images = []
    
    if not image_refs:
        return copied_images
    
    # Create assets directory if it doesn't exist
    os.makedirs(assets_dir, exist_ok=True)
    
    project_dir = os.path.join(repo_path, project_path)
    
    for image_ref in image_refs:
        # Handle relative paths
        source_path = os.path.join(project_dir, image_ref)
        
        # Normalize the path
        source_path = os.path.normpath(source_path)
        
        if os.path.exists(source_path) and os.path.isfile(source_path):
            # Create a unique name based on project and original filename
            project_name = os.path.basename(project_path)
            filename = os.path.basename(image_ref)
            
            # Preserve directory structure if image is in subdirectory
            rel_dir = os.path.dirname(image_ref)
            if rel_dir and rel_dir != '.':
                dest_subdir = os.path.join(assets_dir, project_name, rel_dir)
                os.makedirs(dest_subdir, exist_ok=True)
                dest_path = os.path.join(dest_subdir, filename)
                # Path relative to assets_dir for web
                web_path = os.path.join(project_name, rel_dir, filename).replace('\\', '/')
            else:
                dest_path = os.path.join(assets_dir, f"{project_name}_{filename}")
                web_path = f"{project_name}_{filename}"
            
            # Get the image path relative to the git repository root
            is_external = project_path.startswith("external-projects")
            if is_external:
                # For external projects, the image path is relative to the external project root
                image_git_path = image_ref
            else:
                # For local projects, include the project path
                image_git_path = os.path.join(project_path, image_ref)
            
            # Get the version history of this image
            image_history = get_image_history(project_git_root, image_git_path)
            
            try:
                shutil.copy2(source_path, dest_path)
                
                # Get current file size
                current_size = os.path.getsize(source_path)
                
                copied_images.append({
                    "source": image_ref,
                    "destination": web_path,
                    "fullPath": dest_path,
                    "currentSize": current_size,
                    "versions": image_history,
                    "versionCount": len(image_history)
                })
                print(f"  Copied image: {image_ref} -> assets/{web_path} ({len(image_history)} versions)")
            except Exception as e:
                print(f"  Warning: Could not copy image {image_ref}: {e}", file=sys.stderr)
        else:
            print(f"  Warning: Image not found: {image_ref}", file=sys.stderr)
    
    return copied_images


def find_projects(repo_path: str) -> List[str]:
    """Find all projects (directories containing click.md files)."""
    projects = []
    
    # Look for click.md files in the projects directory (local projects)
    projects_dir = os.path.join(repo_path, "projects")
    if os.path.exists(projects_dir):
        for root, dirs, files in os.walk(projects_dir):
            if "click.md" in files:
                # Get the relative path from repo root
                rel_path = os.path.relpath(root, repo_path)
                projects.append(rel_path)
    
    # Look for click.md files in external-projects directory (external repos)
    external_projects_dir = os.path.join(repo_path, "external-projects")
    if os.path.exists(external_projects_dir):
        # Each subdirectory in external-projects is a separate git repository
        for project_name in os.listdir(external_projects_dir):
            project_path = os.path.join(external_projects_dir, project_name)
            if os.path.isdir(project_path):
                # Look for click.md in the root of the external project
                click_file = os.path.join(project_path, "click.md")
                if os.path.exists(click_file):
                    rel_path = os.path.relpath(project_path, repo_path)
                    projects.append(rel_path)
                else:
                    # Also search subdirectories of external project
                    for root, dirs, files in os.walk(project_path):
                        if "click.md" in files:
                            rel_path = os.path.relpath(root, repo_path)
                            projects.append(rel_path)
                            break  # Only take the first click.md found in each external project
    
    return projects


def generate_temporal_data(repo_path: str, output_file: str) -> None:
    """Generate the complete temporal data model for all projects."""
    print(f"Generating temporal data for repository: {repo_path}")
    
    # Find all projects
    project_paths = find_projects(repo_path)
    
    if not project_paths:
        print("Warning: No projects with click.md files found")
        print("Creating empty data structure...")
    
    # Prepare assets directory
    output_dir = os.path.dirname(output_file)
    assets_dir = os.path.join(output_dir, "assets")
    
    projects_data = []
    
    for project_path in project_paths:
        project_name = os.path.basename(project_path)
        click_file_path = os.path.join(project_path, "click.md")
        
        print(f"\nProcessing project: {project_name}")
        
        # Determine if this is an external project
        is_external = project_path.startswith("external-projects")
        
        # For external projects, use the external project's git repository
        # For local projects, use the main repository
        if is_external:
            project_git_root = os.path.join(repo_path, project_path)
            # click.md path relative to the external project root
            click_file_rel_path = "click.md"
        else:
            project_git_root = repo_path
            click_file_rel_path = click_file_path
        
        # Get all commits for the project repository
        all_commits = get_all_commits(project_git_root)
        print(f"  Found {len(all_commits)} total commits in project repository")
        
        # Get click.md specific commits
        click_commits = get_click_file_commits(project_git_root, click_file_rel_path)
        print(f"  Found {len(click_commits)} commits for click.md")
        
        # Get blame history
        blame_history = get_blame_history(project_git_root, click_file_rel_path)
        print(f"  Extracted blame history for {len(blame_history)} lines")
        
        # Get current content
        current_content = get_current_content(repo_path, click_file_path)
        
        # Extract and copy images
        image_refs = extract_image_references(current_content)
        copied_images = copy_images_to_assets(repo_path, project_path, project_git_root, image_refs, assets_dir)
        
        project_data = {
            "name": project_name,
            "path": project_path,
            "commits": all_commits,
            "clickFile": {
                "path": click_file_path,
                "commits": click_commits,
                "blameHistory": blame_history,
                "currentContent": current_content,
                "images": copied_images
            }
        }
        
        projects_data.append(project_data)
    
    # Create the complete data structure
    data = {
        "projects": projects_data,
        "metadata": {
            "generatedAt": datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
            "version": "1.0.0"
        }
    }
    
    # Write to output file
    output_path = os.path.join(repo_path, output_file)
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)
    
    print(f"\nTemporal data written to: {output_path}")
    print(f"Total projects processed: {len(projects_data)}")


def main():
    """Main entry point."""
    if len(sys.argv) > 1:
        repo_path = sys.argv[1]
    else:
        repo_path = os.getcwd()
    
    if len(sys.argv) > 2:
        output_file = sys.argv[2]
    else:
        output_file = "dist/temporal-data.json"
    
    # Validate that we're in a git repository
    if not os.path.exists(os.path.join(repo_path, ".git")):
        print(f"Error: {repo_path} is not a git repository", file=sys.stderr)
        sys.exit(1)
    
    generate_temporal_data(repo_path, output_file)
    print("\nDone!")


if __name__ == "__main__":
    main()
