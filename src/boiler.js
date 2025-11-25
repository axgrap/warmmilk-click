/**
 * Boiler.js - Animated hand-drawn effect for SVG lines
 * Applies a "boiling" animation to SVG elements with the hand-drawn filter
 */

(function () {
  "use strict";

  // Configuration
  const config = {
    baseFrequency: 0.02,
    frequencyOffsets: [-0.02, 0.01, -0.01, 0.02],
    animationScale: 0.2,
    interval: 100, // milliseconds between updates
    displacementScale: 5.0,
  };

  let currentOffsetIndex = 0;
  let intervalId = null;

  /**
   * Initialize the boiling effect
   */
  function init() {
    // Create and add the hand-drawn filter to the document if it doesn't exist
    ensureHandDrawnFilter();

    // Apply filter to all SVGs that should have the hand-drawn effect
    applyHandDrawnFilter();

    const filter = document.getElementById("hand-drawn");
    if (!filter) {
      console.warn("Boiler.js: hand-drawn filter not found");
      return;
    }

    const turbulence = filter.querySelector("feTurbulence");
    if (!turbulence) {
      console.warn("Boiler.js: feTurbulence element not found");
      return;
    }

    // Start the animation loop
    intervalId = setInterval(() => {
      animate(turbulence);
    }, config.interval);
  }

  /**
   * Ensure the hand-drawn filter exists in the document
   */
  function ensureHandDrawnFilter() {
    if (document.getElementById("hand-drawn")) {
      return; // Filter already exists
    }

    const filterSvg = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg"
    );
    filterSvg.setAttribute("width", "0");
    filterSvg.setAttribute("height", "0");
    filterSvg.style.position = "absolute";

    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");

    const filter = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "filter"
    );
    filter.setAttribute("id", "hand-drawn");
    filter.setAttribute("filterUnits", "objectBoundingBox");
    filter.setAttribute("x", "-20%");
    filter.setAttribute("y", "-20%");
    filter.setAttribute("width", "140%");
    filter.setAttribute("height", "140%");

    const turbulence = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "feTurbulence"
    );
    turbulence.setAttribute("type", "turbulence");
    turbulence.setAttribute("baseFrequency", "0.02");
    turbulence.setAttribute("numOctaves", "2");
    turbulence.setAttribute("result", "noise");

    const displacementMap = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "feDisplacementMap"
    );
    displacementMap.setAttribute("in", "SourceGraphic");
    displacementMap.setAttribute("in2", "noise");
    displacementMap.setAttribute("scale", "5");
    displacementMap.setAttribute("xChannelSelector", "R");
    displacementMap.setAttribute("yChannelSelector", "G");

    filter.appendChild(turbulence);
    filter.appendChild(displacementMap);
    defs.appendChild(filter);
    filterSvg.appendChild(defs);

    document.body.insertBefore(filterSvg, document.body.firstChild);
  }

  /**
   * Apply the hand-drawn filter to all relevant SVG elements
   */
  function applyHandDrawnFilter() {
    // Apply to header SVGs
    const headerSvgs = document.querySelectorAll("header svg");
    headerSvgs.forEach((svg) => {
      if (!svg.hasAttribute("filter")) {
        svg.setAttribute("filter", "url(#hand-drawn)");
      }
    });

    // Apply to content SVGs
    const contentSvgs = document.querySelectorAll(
      ".content-separator svg, .header-line svg"
    );
    contentSvgs.forEach((svg) => {
      if (!svg.hasAttribute("filter")) {
        svg.setAttribute("filter", "url(#hand-drawn)");
      }
    });
  }

  /**
   * Animate the turbulence by cycling through frequency offsets
   */
  function animate(turbulence) {
    const offset = config.frequencyOffsets[currentOffsetIndex];
    const adjustedOffset = offset * config.animationScale;
    const newFrequency = config.baseFrequency + adjustedOffset;

    // Update the baseFrequency attribute
    turbulence.setAttribute("baseFrequency", newFrequency.toFixed(4));

    // Move to next offset
    currentOffsetIndex =
      (currentOffsetIndex + 1) % config.frequencyOffsets.length;
  }

  /**
   * Stop the animation
   */
  function stop() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  /**
   * Update configuration
   */
  function updateConfig(newConfig) {
    Object.assign(config, newConfig);
  }

  // Auto-initialize when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Expose API for external control (optional)
  window.Boiler = {
    stop,
    start: init,
    updateConfig,
  };
})();
