/**
 * Warmmilk Click Client Library
 *
 * A client library for navigating and querying temporal project data.
 *
 * @example
 * const client = new WarmmilkClickClient('temporal-data.json');
 * await client.load();
 *
 * const projects = client.getProjects();
 * const project = client.getProject('example');
 * const commits = project.getCommits();
 * const images = project.getImages();
 */

class WarmmilkClickClient {
  constructor(dataUrl) {
    this.dataUrl = dataUrl;
    this.data = null;
    this.projects = new Map();
  }

  /**
   * Load the temporal data from the server
   * @returns {Promise<void>}
   */
  async load() {
    const response = await fetch(this.dataUrl);
    if (!response.ok) {
      throw new Error(`Failed to load data: ${response.statusText}`);
    }
    this.data = await response.json();
    this._buildProjectIndex();
  }

  /**
   * Build internal index of projects for fast access
   * @private
   */
  _buildProjectIndex() {
    if (!this.data || !this.data.projects) {
      return;
    }

    this.data.projects.forEach((projectData) => {
      const project = new Project(projectData, this);
      this.projects.set(projectData.name, project);
    });
  }

  /**
   * Get all projects
   * @returns {Project[]}
   */
  getProjects() {
    return Array.from(this.projects.values());
  }

  /**
   * Get a specific project by name
   * @param {string} name - Project name
   * @returns {Project|null}
   */
  getProject(name) {
    return this.projects.get(name) || null;
  }

  /**
   * Get metadata about when data was generated
   * @returns {Object}
   */
  getMetadata() {
    return this.data?.metadata || null;
  }

  /**
   * Get all commits across all projects
   * @returns {Commit[]}
   */
  getAllCommits() {
    const allCommits = [];
    this.getProjects().forEach((project) => {
      allCommits.push(...project.getCommits());
    });
    // Sort by date descending
    return allCommits.sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  /**
   * Search commits by message
   * @param {string} query - Search query
   * @returns {Commit[]}
   */
  searchCommits(query) {
    const lowerQuery = query.toLowerCase();
    return this.getAllCommits().filter((commit) =>
      commit.message.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Get commits by author
   * @param {string} author - Author name or email
   * @returns {Commit[]}
   */
  getCommitsByAuthor(author) {
    const lowerAuthor = author.toLowerCase();
    return this.getAllCommits().filter(
      (commit) =>
        commit.author.toLowerCase().includes(lowerAuthor) ||
        commit.email.toLowerCase().includes(lowerAuthor)
    );
  }

  /**
   * Get commits in a date range
   * @param {Date|string} startDate
   * @param {Date|string} endDate
   * @returns {Commit[]}
   */
  getCommitsByDateRange(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    return this.getAllCommits().filter((commit) => {
      const commitDate = new Date(commit.date);
      return commitDate >= start && commitDate <= end;
    });
  }
}

class Project {
  constructor(data, client) {
    this.data = data;
    this.client = client;
    this.name = data.name;
    this.path = data.path;
  }

  /**
   * Get all commits in this project
   * @returns {Commit[]}
   */
  getCommits() {
    return (this.data.commits || []).map((c) => new Commit(c, this));
  }

  /**
   * Get the click.md file data
   * @returns {ClickFile}
   */
  getClickFile() {
    return new ClickFile(this.data.clickFile, this);
  }

  /**
   * Get commits that modified click.md
   * @returns {Commit[]}
   */
  getClickFileCommits() {
    return this.getClickFile().getCommits();
  }

  /**
   * Get the blame history for click.md
   * @returns {BlameLine[]}
   */
  getBlameHistory() {
    return this.getClickFile().getBlameHistory();
  }

  //TODO: get blame history sequential chunks by commit.

  /**
   * Get all images in this project
   * @returns {ImageAsset[]}
   */
  getImages() {
    return this.getClickFile().getImages();
  }

  /**
   * Get a specific image by source path
   * @param {string} source - Image source path
   * @returns {ImageAsset|null}
   */
  getImage(source) {
    return this.getImages().find((img) => img.source === source) || null;
  }

  /**
   * Get the current content of click.md
   * @returns {string}
   */
  getCurrentContent() {
    return this.data.clickFile?.currentContent || "";
  }

  /**
   * Get commits by author in this project
   * @param {string} author
   * @returns {Commit[]}
   */
  getCommitsByAuthor(author) {
    const lowerAuthor = author.toLowerCase();
    return this.getCommits().filter(
      (commit) =>
        commit.author.toLowerCase().includes(lowerAuthor) ||
        commit.email.toLowerCase().includes(lowerAuthor)
    );
  }

  /**
   * Get project statistics
   * @returns {Object}
   */
  getStats() {
    const commits = this.getCommits();
    const clickFileCommits = this.getClickFileCommits();
    const images = this.getImages();
    const blameHistory = this.getBlameHistory();

    return {
      name: this.name,
      path: this.path,
      totalCommits: commits.length,
      clickFileCommits: clickFileCommits.length,
      totalImages: images.length,
      linesTracked: blameHistory.length,
      authors: [...new Set(commits.map((c) => c.author))],
      dateRange: {
        first: commits.length > 0 ? commits[commits.length - 1].date : null,
        last: commits.length > 0 ? commits[0].date : null,
      },
    };
  }
}

class ClickFile {
  constructor(data, project) {
    this.data = data || {};
    this.project = project;
    this.path = data?.path || "";
  }

  /**
   * Get commits that modified this file
   * @returns {Commit[]}
   */
  getCommits() {
    return (this.data.commits || []).map((c) => new Commit(c, this.project));
  }

  /**
   * Get blame history
   * @returns {BlameLine[]}
   */
  getBlameHistory() {
    return (this.data.blameHistory || []).map((b) => new BlameLine(b, this));
  }

  /**
   * Get images referenced in this file
   * @returns {ImageAsset[]}
   */
  getImages() {
    return (this.data.images || []).map((img) => new ImageAsset(img, this));
  }

  /**
   * Get current content
   * @returns {string}
   */
  getCurrentContent() {
    return this.data.currentContent || "";
  }

  /**
   * Get lines written by a specific author
   * @param {string} author
   * @returns {BlameLine[]}
   */
  getLinesByAuthor(author) {
    const lowerAuthor = author.toLowerCase();
    return this.getBlameHistory().filter((line) =>
      line.author.toLowerCase().includes(lowerAuthor)
    );
  }

  /**
   * Get lines from a specific commit
   * @param {string} commitSha
   * @returns {BlameLine[]}
   */
  getLinesByCommit(commitSha) {
    return this.getBlameHistory().filter((line) =>
      line.commit.startsWith(commitSha)
    );
  }
}

class Commit {
  constructor(data, project) {
    this.data = data;
    this.project = project;
    this.sha = data.sha;
    this.author = data.author;
    this.email = data.email;
    this.date = data.date;
    this.message = data.message;
    this.files = data.files || [];
  }

  /**
   * Get short SHA (first 7 characters)
   * @returns {string}
   */
  getShortSha() {
    return this.sha.substring(0, 7);
  }

  /**
   * Get commit date as Date object
   * @returns {Date}
   */
  getDate() {
    return new Date(this.date);
  }

  /**
   * Get formatted date string
   * @param {string} locale - Locale for formatting
   * @returns {string}
   */
  getFormattedDate(locale = "en-US") {
    return this.getDate().toLocaleDateString(locale);
  }

  /**
   * Check if this commit modified click.md
   * @returns {boolean}
   */
  modifiedClickFile() {
    return this.files.some((file) => file.includes("click.md"));
  }

  /**
   * Check if this commit modified any images
   * @returns {boolean}
   */
  modifiedImages() {
    return this.files.some((file) =>
      /\.(png|jpg|jpeg|gif|svg|webp)$/i.test(file)
    );
  }

  /**
   * Get the project this commit belongs to
   * @returns {Project}
   */
  getProject() {
    return this.project;
  }
}

class BlameLine {
  constructor(data, clickFile) {
    this.data = data;
    this.clickFile = clickFile;
    this.lineStart = data.lineStart;
    this.lineEnd = data.lineEnd;
    this.commit = data.commit;
    this.author = data.author;
    this.email = data.email;
    this.date = data.date;
    this.content = data.content;
    this.originalLineStart = data.originalLineStart;
  }

  /**
   * Get the commit that introduced this line
   * @returns {string}
   */
  getCommitSha() {
    return this.commit;
  }

  /**
   * Get short commit SHA
   * @returns {string}
   */
  getShortSha() {
    return this.commit.substring(0, 7);
  }

  /**
   * Get line date as Date object
   * @returns {Date}
   */
  getDate() {
    return new Date(this.date);
  }

  /**
   * Get formatted date string
   * @param {string} locale
   * @returns {string}
   */
  getFormattedDate(locale = "en-US") {
    return this.getDate().toLocaleDateString(locale);
  }

  /**
   * Check if this is an empty line
   * @returns {boolean}
   */
  isEmpty() {
    return !this.content || this.content.trim() === "";
  }

  /**
   * Get the ClickFile this line belongs to
   * @returns {ClickFile}
   */
  getClickFile() {
    return this.clickFile;
  }
}

class ImageAsset {
  constructor(data, clickFile) {
    this.data = data;
    this.clickFile = clickFile;
    this.source = data.source;
    this.destination = data.destination;
    this.fullPath = data.fullPath;
    this.currentSize = data.currentSize;
    this.versionCount = data.versionCount || 0;
    this.versions = (data.versions || []).map((v) => new ImageVersion(v, this));
  }

  /**
   * Get the destination URL for this image
   * @returns {string}
   */
  getUrl() {
    return `assets/${this.destination}`;
  }

  /**
   * Get all versions of this image
   * @returns {ImageVersion[]}
   */
  getVersions() {
    return this.versions;
  }

  /**
   * Get the latest version
   * @returns {ImageVersion|null}
   */
  getLatestVersion() {
    return this.versions.length > 0 ? this.versions[0] : null;
  }

  /**
   * Get the first version (when image was added)
   * @returns {ImageVersion|null}
   */
  getFirstVersion() {
    return this.versions.length > 0
      ? this.versions[this.versions.length - 1]
      : null;
  }

  /**
   * Get formatted file size
   * @returns {string}
   */
  getFormattedSize() {
    return this._formatBytes(this.currentSize);
  }

  /**
   * Check if image has multiple versions
   * @returns {boolean}
   */
  hasMultipleVersions() {
    return this.versionCount > 1;
  }

  /**
   * Get version history statistics
   * @returns {Object}
   */
  getVersionStats() {
    if (this.versions.length === 0) {
      return null;
    }

    const sizes = this.versions.map((v) => v.size);
    return {
      count: this.versionCount,
      currentSize: this.currentSize,
      minSize: Math.min(...sizes),
      maxSize: Math.max(...sizes),
      averageSize: sizes.reduce((a, b) => a + b, 0) / sizes.length,
      sizeChange: this.currentSize - sizes[sizes.length - 1],
      dateRange: {
        first: this.versions[this.versions.length - 1].date,
        last: this.versions[0].date,
      },
    };
  }

  /**
   * Format bytes to human readable string
   * @private
   */
  _formatBytes(bytes) {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  }

  /**
   * Get the ClickFile this image belongs to
   * @returns {ClickFile}
   */
  getClickFile() {
    return this.clickFile;
  }
}

class ImageVersion {
  constructor(data, imageAsset) {
    this.data = data;
    this.imageAsset = imageAsset;
    this.sha = data.sha;
    this.author = data.author;
    this.email = data.email;
    this.date = data.date;
    this.message = data.message;
    this.size = data.size;
  }

  /**
   * Get short SHA
   * @returns {string}
   */
  getShortSha() {
    return this.sha.substring(0, 7);
  }

  /**
   * Get version date as Date object
   * @returns {Date}
   */
  getDate() {
    return new Date(this.date);
  }

  /**
   * Get formatted date string
   * @param {string} locale
   * @returns {string}
   */
  getFormattedDate(locale = "en-US") {
    return this.getDate().toLocaleDateString(locale);
  }

  /**
   * Get formatted file size
   * @returns {string}
   */
  getFormattedSize() {
    return this._formatBytes(this.size);
  }

  /**
   * Format bytes to human readable string
   * @private
   */
  _formatBytes(bytes) {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  }

  /**
   * Get the ImageAsset this version belongs to
   * @returns {ImageAsset}
   */
  getImageAsset() {
    return this.imageAsset;
  }
}

// Export for different module systems
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    WarmmilkClickClient,
    Project,
    ClickFile,
    Commit,
    BlameLine,
    ImageAsset,
    ImageVersion,
  };
}

if (typeof window !== "undefined") {
  window.WarmmilkClickClient = WarmmilkClickClient;
  window.WarmmilkClick = {
    Client: WarmmilkClickClient,
    Project,
    ClickFile,
    Commit,
    BlameLine,
    ImageAsset,
    ImageVersion,
  };
}
