/**
 * Morph.js - Scroll-based SVG line morphing
 * Smoothly transitions SVG line coordinates based on scroll position
 */

(function () {
  "use strict";

  // Configuration
  const config = {
    scrollThreshold: 200, // Pixels to scroll before fully compact
    headerCompactHeight: (heightsArr) => Math.min(...heightsArr), // Compact header height in pixels
  };

  // Store morphing targets dynamically
  const morphTargets = [];
  let header = null;
  let initialHeaderHeight = null;
  let ticking = false;

  /**
   * Load SVG content from a file
   */
  function loadSVG(url) {
    return fetch(url)
      .then((response) => response.text())
      .then((svgText) => {
        const parser = new DOMParser();
        const svgDoc = parser.parseFromString(svgText, "image/svg+xml");
        return svgDoc.documentElement;
      });
  }

  /**
   * Wait for object element to load and return its SVG document
   */
  function waitForObjectLoad(objectElement) {
    return new Promise((resolve, reject) => {
      if (objectElement.contentDocument) {
        resolve(objectElement.contentDocument.documentElement);
        return;
      }

      objectElement.addEventListener("load", () => {
        try {
          resolve(objectElement.contentDocument.documentElement);
        } catch (error) {
          reject(error);
        }
      });

      objectElement.addEventListener("error", reject);
    });
  }

  /**
   * Extract line coordinates from SVG lines
   */
  function extractLineCoordinates(lines) {
    return Array.from(lines).map((line) => ({
      x1: parseFloat(line.getAttribute("x1")),
      y1: parseFloat(line.getAttribute("y1")),
      x2: parseFloat(line.getAttribute("x2")),
      y2: parseFloat(line.getAttribute("y2")),
    }));
  }

  /**
   * Extract path data from SVG paths
   */
  function extractPathData(paths) {
    return Array.from(paths).map((path) => path.getAttribute("d"));
  }

  /**
   * Parse SVG path data into coordinate arrays
   */
  function parsePathData(pathData) {
    const commands = [];
    const regex = /([MLHVCSQTAZmlhvcsqtaz])([^MLHVCSQTAZmlhvcsqtaz]*)/g;
    let match;

    while ((match = regex.exec(pathData)) !== null) {
      const command = match[1];
      const params = match[2]
        .trim()
        .split(/[\s,]+/)
        .filter((p) => p.length > 0) // Filter out empty strings
        .map(parseFloat)
        .filter((n) => !isNaN(n)); // Filter out NaN values

      commands.push({ command, params });
    }

    return commands;
  }

  /**
   * Convert path commands back to path data string
   */
  function pathCommandsToString(commands) {
    return commands
      .map((cmd) => cmd.command + " " + cmd.params.join(" "))
      .join(" ");
  }

  /**
   * Convert L (line) commands to Q (quadratic curve) commands with control point on the line
   * This creates a degenerate curve that looks like a straight line but can morph with curves
   */
  function convertLinesToCurves(commands) {
    let currentPoint = { x: 0, y: 0 };

    return commands.map((cmd) => {
      if (cmd.command === "M") {
        currentPoint = { x: cmd.params[0], y: cmd.params[1] };
        return cmd;
      } else if (cmd.command === "L") {
        // Convert L to Q with control point at midpoint (creates straight line)
        const endX = cmd.params[0];
        const endY = cmd.params[1];
        const midX = (currentPoint.x + endX) / 2;
        const midY = (currentPoint.y + endY) / 2;

        const result = {
          command: "Q",
          params: [midX, midY, endX, endY],
        };

        currentPoint = { x: endX, y: endY };
        return result;
      } else {
        // Q or other commands - update current point and return as-is
        if (cmd.command === "Q") {
          currentPoint = { x: cmd.params[2], y: cmd.params[3] };
        }
        return cmd;
      }
    });
  }

  /**
   * Normalize path commands to supported types (M, L, Q only) and convert to absolute coordinates
   */
  function normalizePathCommands(commands) {
    let currentPoint = { x: 0, y: 0 };

    return commands.map((cmd) => {
      const isRelative = cmd.command === cmd.command.toLowerCase();
      let normalizedCmd;

      switch (cmd.command.toUpperCase()) {
        case "M": // Move to
        case "L": {
          // Line to
          const x = cmd.params[0];
          const y = cmd.params[1];
          normalizedCmd = {
            command: cmd.command.toUpperCase(),
            params: isRelative
              ? [currentPoint.x + x, currentPoint.y + y]
              : [x, y],
          };
          currentPoint = {
            x: normalizedCmd.params[0],
            y: normalizedCmd.params[1],
          };
          break;
        }
        case "Q": {
          // Quadratic curve
          const cx = cmd.params[0];
          const cy = cmd.params[1];
          const x = cmd.params[2];
          const y = cmd.params[3];
          normalizedCmd = {
            command: "Q",
            params: isRelative
              ? [
                  currentPoint.x + cx,
                  currentPoint.y + cy,
                  currentPoint.x + x,
                  currentPoint.y + y,
                ]
              : [cx, cy, x, y],
          };
          currentPoint = {
            x: normalizedCmd.params[2],
            y: normalizedCmd.params[3],
          };
          break;
        }
        case "C": {
          // Cubic bezier - convert to quadratic approximation
          const c1x = cmd.params[0];
          const c1y = cmd.params[1];
          const c2x = cmd.params[2];
          const c2y = cmd.params[3];
          const x = cmd.params[4];
          const y = cmd.params[5];

          // Convert to absolute if relative
          const absC1x = isRelative ? currentPoint.x + c1x : c1x;
          const absC1y = isRelative ? currentPoint.y + c1y : c1y;
          const absC2x = isRelative ? currentPoint.x + c2x : c2x;
          const absC2y = isRelative ? currentPoint.y + c2y : c2y;
          const absX = isRelative ? currentPoint.x + x : x;
          const absY = isRelative ? currentPoint.y + y : y;

          // Approximate with quadratic
          const qx = (absC1x + absC2x) / 2;
          const qy = (absC1y + absC2y) / 2;

          normalizedCmd = { command: "Q", params: [qx, qy, absX, absY] };
          currentPoint = { x: absX, y: absY };
          break;
        }
        case "A": // Arc - not supported
          throw new Error(
            `SVG arc commands (A) are not supported for morphing`
          );
        default:
          throw new Error(`Unsupported SVG path command: ${cmd.command}`);
      }

      return normalizedCmd;
    });
  }

  /**
   * Get the end point of a path command
   */
  function getCommandEndPoint(cmd, currentPoint) {
    const isRelative = cmd.command === cmd.command.toLowerCase();

    switch (cmd.command.toUpperCase()) {
      case "M":
      case "L": {
        const x = cmd.params[0];
        const y = cmd.params[1];
        return isRelative
          ? { x: currentPoint.x + x, y: currentPoint.y + y }
          : { x, y };
      }
      case "Q": {
        const x = cmd.params[2];
        const y = cmd.params[3];
        return isRelative
          ? { x: currentPoint.x + x, y: currentPoint.y + y }
          : { x, y };
      }
      case "C": {
        const x = cmd.params[4];
        const y = cmd.params[5];
        return isRelative
          ? { x: currentPoint.x + x, y: currentPoint.y + y }
          : { x, y };
      }
      default:
        return currentPoint;
    }
  }

  /**
   * Calculate the "importance" of a point for decimation
   * Higher values mean the point is more important to keep
   */
  function calculatePointImportance(prev, current, next) {
    if (!prev || !next) return Infinity; // Keep endpoints

    // Calculate perpendicular distance from point to line between prev and next
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const lineLength = Math.sqrt(dx * dx + dy * dy);

    if (lineLength === 0) return 0;

    // Distance from current point to the line
    const distance = Math.abs(
      (dy * current.x - dx * current.y + next.x * prev.y - next.y * prev.x) /
        lineLength
    );

    return distance;
  }

  /**
   * Decimate a path to have fewer commands by removing least important points
   */
  function decimatePath(commands, targetCount) {
    if (commands.length <= targetCount) return commands;

    // Keep track of original commands with their metadata
    let points = [];
    let currentPoint = { x: 0, y: 0 };

    commands.forEach((cmd, idx) => {
      const endPoint = getCommandEndPoint(cmd, currentPoint);
      points.push({
        x: endPoint.x,
        y: endPoint.y,
        originalCommand: cmd, // Preserve the original command
        originalIndex: points.length,
      });
      currentPoint = endPoint;
    });

    // Iteratively remove the least important points
    let iterations = 0;
    while (points.length > targetCount) {
      let minImportance = Infinity;
      let removeIndex = -1;

      // Find the least important point (skip first and last)
      for (let i = 1; i < points.length - 1; i++) {
        const importance = calculatePointImportance(
          points[i - 1],
          points[i],
          points[i + 1]
        );

        if (importance < minImportance) {
          minImportance = importance;
          removeIndex = i;
        }
      }

      if (removeIndex > 0) {
        points.splice(removeIndex, 1);
        iterations++;
      } else {
        break; // Can't remove any more points safely
      }
    }

    // Convert back to commands, preserving curve information where possible
    const result = [];
    points.forEach((point, i) => {
      if (i === 0) {
        result.push({ command: "M", params: [point.x, point.y] });
      } else {
        // Preserve the original command type if it was a curve
        if (point.originalCommand.command === "Q") {
          result.push(point.originalCommand);
        } else {
          result.push({ command: "L", params: [point.x, point.y] });
        }
      }
    });

    return result;
  }

  /**
   * Generate intermediate points to match path lengths
   */
  function generateIntermediatePoints(startCmds, endCmds) {
    const startLen = startCmds.length;
    const endLen = endCmds.length;
    const targetLen = Math.min(startLen, endLen);

    // Decimate the more complex path to match the simpler one
    const finalStart =
      startLen > endLen ? decimatePath(startCmds, targetLen) : startCmds;
    const finalEnd =
      endLen > startLen ? decimatePath(endCmds, targetLen) : endCmds;

    return [finalStart, finalEnd];
  }

  /**
   * Interpolate between two commands for point generation
   */
  function interpolateCommands(cmd1, cmd2, t) {
    if (cmd1.command !== cmd2.command) {
      // If commands differ, use the first command type
      return {
        command: cmd1.command,
        params: cmd1.params.map((param, i) =>
          lerp(param, cmd2.params[i] || param, t)
        ),
      };
    }

    return {
      command: cmd1.command,
      params: cmd1.params.map((param, i) =>
        lerp(param, cmd2.params[i] || param, t)
      ),
    };
  }

  /**
   * Interpolate between two normalized path command arrays
   */
  function interpolatePathCommands(startCommands, endCommands, t) {
    // Normalize both command sets
    let normalizedStart = normalizePathCommands(startCommands);
    let normalizedEnd = normalizePathCommands(endCommands);

    // Convert any L commands to Q commands for smooth curve morphing
    normalizedStart = convertLinesToCurves(normalizedStart);
    normalizedEnd = convertLinesToCurves(normalizedEnd);

    // Generate intermediate points if lengths differ
    const [finalStart, finalEnd] = generateIntermediatePoints(
      normalizedStart,
      normalizedEnd
    );

    // Interpolate parameters - all commands should now be M or Q
    return finalStart.map((startCmd, i) => {
      const endCmd = finalEnd[i];

      return {
        command: startCmd.command,
        params: startCmd.params.map((param, j) =>
          lerp(param, endCmd.params[j] || param, t)
        ),
      };
    });
  }

  /**
   * Linear interpolation
   */
  function lerp(start, end, t) {
    return start + (end - start) * t;
  }

  /**
   * Easing function for smoother transitions
   */
  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  /**
   * Calculate scroll progress (0 = expanded, 1 = fully compact)
   */
  function getScrollProgress() {
    const scrollY = window.scrollY || window.pageYOffset;
    const progress = Math.min(scrollY / config.scrollThreshold, 1);
    return easeOutCubic(progress);
  }

  /**
   * Update line/path coordinates based on scroll progress
   */
  function updateLines() {
    const scrollY = window.scrollY || window.pageYOffset;
    const progress = getScrollProgress();

    // Morph all targets
    morphTargets.forEach((target) => {
      target.elements.forEach((element, i) => {
        const start = target.states.expanded[i];
        const end = target.states.compact[i];

        if (target.elementType === "line") {
          element.setAttribute("x1", lerp(start.x1, end.x1, progress));
          element.setAttribute("y1", lerp(start.y1, end.y1, progress));
          element.setAttribute("x2", lerp(start.x2, end.x2, progress));
          element.setAttribute("y2", lerp(start.y2, end.y2, progress));
        } else if (target.elementType === "path") {
          try {
            // For paths, interpolate the path data
            const startPath = parsePathData(start);
            const endPath = parsePathData(end);

            const interpolatedPath = interpolatePathCommands(
              startPath,
              endPath,
              progress
            );

            element.setAttribute("d", pathCommandsToString(interpolatedPath));
          } catch (error) {
            console.error(
              `Morph.js: Path morphing failed for element ${i}:`,
              error.message
            );
            // Keep the start path as fallback
            element.setAttribute("d", start);
          }
        }
      });
    });

    // Shrink header height (use linear progress for more responsive feel)
    if (header && initialHeaderHeight !== null && !isNaN(initialHeaderHeight)) {
      const linearProgress = Math.min(scrollY / config.scrollThreshold, 1);
      const headerHeight = lerp(
        initialHeaderHeight,
        Math.min(...morphTargets.map((t) => t.compactHeight)),
        linearProgress
      );
      header.style.height = `${headerHeight}px`;
    }

    // Scale SVG heights and viewBox for all morph targets
    morphTargets.forEach((target) => {
      if (target.svgElement && target.initialHeight && target.compactHeight) {
        const linearProgress = Math.min(scrollY / config.scrollThreshold, 1);
        const svgHeight = lerp(
          target.initialHeight,
          target.compactHeight,
          linearProgress
        );
        target.svgElement.setAttribute("height", svgHeight);

        // Interpolate viewBox if both are defined
        if (target.expandedViewBox && target.compactViewBox) {
          const vbX = lerp(
            target.expandedViewBox[0],
            target.compactViewBox[0],
            linearProgress
          );
          const vbY = lerp(
            target.expandedViewBox[1],
            target.compactViewBox[1],
            linearProgress
          );
          const vbWidth = lerp(
            target.expandedViewBox[2],
            target.compactViewBox[2],
            linearProgress
          );
          const vbHeight = lerp(
            target.expandedViewBox[3],
            target.compactViewBox[3],
            linearProgress
          );
          target.svgElement.setAttribute(
            "viewBox",
            `${vbX} ${vbY} ${vbWidth} ${vbHeight}`
          );
        }
      }
    });

    ticking = false;
  }

  /**
   * Request animation frame for smooth updates
   */
  function requestTick() {
    if (!ticking) {
      requestAnimationFrame(updateLines);
      ticking = true;
    }
  }

  /**
   * Process a single morph target
   */
  async function processMorphTarget(
    objectElement,
    expandedSvgDoc,
    compactSvgDoc,
    svgUrl
  ) {
    const container = objectElement.parentElement;

    // Determine element type and extract data
    let elementType, expandedElements, compactElements;

    const expandedLines = expandedSvgDoc.querySelectorAll("line");
    const expandedPaths = expandedSvgDoc.querySelectorAll("path");
    const compactLines = compactSvgDoc.querySelectorAll("line");
    const compactPaths = compactSvgDoc.querySelectorAll("path");

    if (expandedPaths.length > 0) {
      elementType = "path";
      expandedElements = expandedPaths;
      compactElements = compactPaths;
    } else {
      elementType = "line";
      expandedElements = expandedLines;
      compactElements = compactLines;
    }

    // Validate element correspondence
    if (expandedElements.length !== compactElements.length) {
      console.error(
        `Morph.js: Element count mismatch for ${svgUrl}. Expanded has ${expandedElements.length} ${elementType} elements, compact has ${compactElements.length}. Skipping morph target.`
      );
      return;
    }

    // Check for id correspondence and reorder compact elements to match expanded
    const expandedIdList = Array.from(expandedElements).map(
      (el) => el.getAttribute("id") || ""
    );
    const compactById = new Map();

    Array.from(compactElements).forEach((el) => {
      const id = el.getAttribute("id") || "";
      compactById.set(id, el);
    });

    // Verify all expanded elements have matching compact elements
    for (let i = 0; i < expandedIdList.length; i++) {
      const id = expandedIdList[i];
      if (!compactById.has(id)) {
        console.error(
          `Morph.js: Missing corresponding element in compact SVG for ${svgUrl}. Expanded element ${i} has id "${id}" but no matching compact element found. Skipping morph target.`
        );
        return;
      }
    }

    // Reorder compact elements to match expanded order
    compactElements = expandedIdList.map((id) => compactById.get(id));

    // Extract data for morphing
    let expandedData, compactData;
    if (elementType === "path") {
      expandedData = extractPathData(expandedElements);
      compactData = extractPathData(compactElements);
    } else {
      expandedData = extractLineCoordinates(expandedElements);
      compactData = extractLineCoordinates(compactElements);
    }

    // Extract SVG heights and viewBox from expanded and compact versions
    let expandedHeight = parseFloat(expandedSvgDoc.getAttribute("height"));
    let compactHeight = parseFloat(compactSvgDoc.getAttribute("height"));

    const expandedViewBox = expandedSvgDoc.getAttribute("viewBox");
    const compactViewBox = compactSvgDoc.getAttribute("viewBox");

    // Parse viewBox values [x, y, width, height]
    const expandedVB = expandedViewBox
      ? expandedViewBox.split(/\s+/).map(parseFloat)
      : null;
    const compactVB = compactViewBox
      ? compactViewBox.split(/\s+/).map(parseFloat)
      : null;

    // If heights are the same, try to use viewBox height instead
    if (expandedHeight === compactHeight && expandedVB && compactVB) {
      const expandedVBHeight = expandedVB[3];
      const compactVBHeight = compactVB[3];

      if (
        expandedVBHeight &&
        compactVBHeight &&
        expandedVBHeight !== compactVBHeight
      ) {
        expandedHeight = expandedVBHeight;
        compactHeight = compactVBHeight;
      }
    }

    // Create SVG element with filter and replace object
    const svgElement = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg"
    );
    svgElement.setAttribute("width", "100%");
    svgElement.setAttribute("height", expandedHeight);
    svgElement.setAttribute("viewBox", expandedSvgDoc.getAttribute("viewBox"));
    svgElement.setAttribute("filter", "url(#hand-drawn)");
    svgElement.innerHTML = expandedSvgDoc.innerHTML;
    container.replaceChild(svgElement, objectElement);

    // Get elements from DOM
    const elements = Array.from(svgElement.querySelectorAll(elementType));

    // Store morph target with SVG height and viewBox data
    morphTargets.push({
      elements,
      elementType,
      svgElement,
      initialHeight: expandedHeight,
      compactHeight: compactHeight,
      expandedViewBox: expandedVB,
      compactViewBox: compactVB,
      states: {
        expanded: expandedData,
        compact: compactData,
      },
    });
  }

  /**
   * Initialize the morphing system
   */
  async function init() {
    header = document.querySelector("header");
    const morphElements = document.querySelectorAll(".morph-target");

    if (morphElements.length === 0) {
      console.warn("Morph.js: No morph-target elements found");
      return;
    }

    try {
      // Process each morph target
      for (const objectElement of morphElements) {
        const svgUrl = objectElement.getAttribute("data");
        if (!svgUrl) {
          console.error(
            `Morph.js: No data attribute found on morph-target element`
          );
          continue;
        }

        // Generate compact file URL
        const compactUrl = svgUrl.replace(/\.svg$/, "-compact.svg");

        try {
          // Check if compact file exists by attempting to fetch it
          const compactResponse = await fetch(compactUrl, { method: "HEAD" });
          if (!compactResponse.ok) {
            console.error(
              `Morph.js: Corresponding compact file not found: ${compactUrl}. Skipping morph target for ${svgUrl}.`
            );
            continue;
          }

          // Wait for object element to load
          const expandedSvgDoc = await waitForObjectLoad(objectElement);

          // Load compact version
          const compactSvgDoc = await loadSVG(compactUrl);

          // Process the SVG pair
          await processMorphTarget(
            objectElement,
            expandedSvgDoc,
            compactSvgDoc,
            svgUrl
          );
        } catch (error) {
          console.error(
            `Morph.js: Failed to process morph target ${svgUrl}:`,
            error
          );
          continue;
        }
      }

      // Read the initial header height from CSS and ensure it's set
      if (header) {
        const computedHeaderHeight = parseFloat(
          getComputedStyle(header).height
        );
        initialHeaderHeight = isNaN(computedHeaderHeight)
          ? 200
          : computedHeaderHeight;
        header.style.height = `${initialHeaderHeight}px`; // Explicitly set initial height
        header.style.transition = "none"; // We'll handle animation ourselves
      }

      // Listen to scroll events
      window.addEventListener("scroll", requestTick, { passive: true });

      // Initial update
      updateLines();
    } catch (error) {
      console.error("Morph.js: Failed to initialize morphing system", error);
    }
  }

  // Auto-initialize when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => init());
  } else {
    init();
  }

  // Expose API for external control (optional)
  window.Morph = {
    updateConfig: (newConfig) => Object.assign(config, newConfig),
  };
})();
