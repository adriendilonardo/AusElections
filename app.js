/* Interactive ternary plot for Australian Federal Election results (D3 v7)
   Features: ternary projection, tooltips, year dropdown, animated transitions,
   click selection -> highlight + fade others.
   
   Plots electoral divisions as points where:
   - Position represents vote share distribution: Labor vs Coalition vs Others
   - Color represents winning party
   - Data sourced from Australian Electoral Commission historical results
*/

async function makeDataset(year) {
  try {
    // Load JSON file for the given year
    const data = await d3.json(`Data/Compact Data/Colour-Positions/ByYear/${year}.json`)
    const tooltipData = await d3.json(`Data/Compact Data/Tooltips/ByYear/${year}.json`);

    // Merge tooltip data into main dataset based on division key
    for (const [div, info] of Object.entries(data)) {
      if (tooltipData[div]) {
        info.tooltip = tooltipData[div];
      }
    }

    const rows = Object.entries(data).map(([key, value]) => { 
      return {
        id: key,
        year: year,
        division:key,
        color: value.colour,
        x: value.x,
        y: value.y,
        tooltip: value.tooltip || null
      };
    });
    return rows;
  } catch (error) {
    console.error(`Error loading data for year ${year}:`, error);
    return []; // Return empty array on error
  }
}

async function makeDatasetByDivision(division) {
  try {
    // Load JSON files for the given division
    const data = await d3.json(`Data/Compact Data/Colour-Positions/ByDivision/${division}.json`);
    const tooltipData = await d3.json(`Data/Compact Data/Tooltips/ByDivision/${division}.json`);

    const rows = Object.entries(data).map(([year, value]) => {
      return {
        id: `${division}_${year}`,
        year: +year,
        division: division,
        color: value.colour,
        x: value.x,
        y: value.y,
        tooltip: tooltipData[year] || null
      };
    });
    return rows;
  } catch (error) {
    console.error(`Error loading data for division ${division}:`, error);
    return []; // Return empty array on error
  }
}

const YEARS = [
    1946, 1949, 
    1951, 1954, 1955, 1958, 
    1961, 1963, 1966, 1969, 
    1972, 1974, 1975, 1977,
    1980, 1983, 1987,
    1990, 1993, 1996, 1998, 
    2001, 2004, 2007, 
    2010, 2013, 2016, 2019, 
    2022, 2025
];

// Data will be loaded on-demand since makeDataset is async
const DATA_BY_YEAR = new Map();
const DATA_BY_DIVISION = new Map();

// ---------- SVG + layout ----------
const svg = d3.select("#chart");
const tooltip = d3.select("#tooltip");

const margin = { top: 10, right: 10, bottom: 10, left: 10 };
const totalWidth = svg.node().getBoundingClientRect().width;
const totalHeight = svg.node().getBoundingClientRect().height;
const W = totalWidth - margin.left - margin.right;
const H = totalHeight - margin.top - margin.bottom;

// Equilateral triangle geometry (base width W, height = W*sqrt(3)/2)
const triW = Math.min(W, 740);
const triH = triW * Math.sqrt(3) / 2;

const originX = margin.left + (W - triW) / 2;
const originY = margin.top + 20;

const A = { x: originX,           y: originY + triH };      // bottom-left
const B = { x: originX + triW,    y: originY + triH };      // bottom-right
const C = { x: originX + triW/2,  y: originY };             // top

svg.append("image")
  .attr("href", "Assets/ternary_bg.png")
  .attr("x", originX)
  .attr("y", originY)
  .attr("width", triW)
  .attr("height", triH)
  .attr("preserveAspectRatio", "none")
  .lower();

// Barycentric -> 2D projection for a+b+c=1
function projectTernary(d) {
  const x = d.a * A.x + d.b * B.x + d.c * C.x;
  const y = d.a * A.y + d.b * B.y + d.c * C.y;
  return { x, y };
}

// Layers
const g = svg.append("g");
const gGrid = g.append("g");
const gFrame = g.append("g");
const gArrows = g.append("g");
const gPoints = g.append("g");
const gLabels = g.append("g");

// Define arrowhead marker
const defs = svg.append("defs");

// Create multiple arrowhead markers for different colors
function createArrowMarker(color, id) {
  const marker = defs.append("marker")
    .attr("id", id)
    .attr("viewBox", "0 -5 10 10")
    .attr("refX", 8)
    .attr("refY", 0)
    .attr("markerWidth", 4)
    .attr("markerHeight", 4)
    .attr("orient", "auto");
    
  marker.append("path")
    .attr("d", "M0,-5L10,0L0,5")
    .attr("fill", color)
    .attr("stroke", "none");
}

// Create default arrowhead
createArrowMarker("#666", "arrowhead");

// Background rect to catch “clear selection” clicks
g.append("rect")
  .attr("x", 0).attr("y", 0)
  .attr("width", totalWidth).attr("height", totalHeight)
  .attr("fill", "transparent")
  .lower()
  .on("click", async () => { 
    selectedId = null; 
    selectedDivision = null;
    divisionMode = false;
    await update(currentYear); 
  });

// ---------- Draw triangle + simple grid ----------
function drawFrame() {
  // Triangle outline
  gFrame.append("path")
    .attr("class", "triangle")
    .attr("d", `M${A.x},${A.y} L${B.x},${B.y} L${C.x},${C.y} Z`);

  // light grid lines (optional)
  const ticks = d3.range(0.5, 1.0, 0.5);
  ticks.forEach(t => {
    // Lines of constant a, b, c
    // constant a = t: connect points where a=t along edges BC
    const lineA = [
      projectTernary({ a: t, b: 1 - t, c: 0 }),
      projectTernary({ a: t, b: 0, c: 1 - t })
    ];
    const lineB = [
      projectTernary({ a: 1 - t, b: t, c: 0 }),
      projectTernary({ a: 0, b: t, c: 1 - t })
    ];
    const lineC = [
      projectTernary({ a: 1 - t, b: 0, c: t }),
      projectTernary({ a: 0, b: 1 - t, c: t })
    ];

    // [lineA, lineB, lineC].forEach(seg => {
    [lineA, lineB].forEach(seg => {
      gGrid.append("path")
        .attr("class", "grid")
        .attr("d", `M${seg[0].x},${seg[0].y} L${seg[1].x},${seg[1].y}`);
    });
  });

  // Corner labels for Australian politics
  gLabels.append("text").attr("x", A.x - 12).attr("y", A.y + 12).attr("text-anchor", "end").text("Labor");
  gLabels.append("text").attr("x", B.x + 12).attr("y", B.y + 12).attr("text-anchor", "start").text("Coalition");
  gLabels.append("text").attr("x", C.x).attr("y", C.y - 12).attr("text-anchor", "middle").text("Others");

  // // Axis hints
  // gLabels.append("text").attr("x", (A.x + B.x) / 2).attr("y", A.y + 40).attr("text-anchor", "middle").attr("fill", "#666")
  //   .text("First preference vote distribution by party");
}
drawFrame();

// ---------- UI: year dropdown ----------
const yearSelect = d3.select("#yearSelect");
yearSelect.selectAll("option")
  .data(YEARS)
  .join("option")
  .attr("value", d => d)
  .text(d => d);

let currentYear = YEARS[YEARS.length - 1]; // default to most recent year
let selectedId = null;
let selectedDivision = null;
let divisionMode = false;

yearSelect.property("value", currentYear);
yearSelect.on("change", async (event) => {
  currentYear = +event.target.value;
  if (!divisionMode) {
    await update(currentYear);
  } else {
    await updateDivision(selectedDivision);
  }
});

// ---------- Navigation buttons ----------
const prevButton = d3.select("#prevYear");
const nextButton = d3.select("#nextYear");

function updateButtonStates() {
  const currentIndex = YEARS.indexOf(currentYear);
  prevButton.property("disabled", currentIndex <= 0);
  nextButton.property("disabled", currentIndex >= YEARS.length - 1);
  
  // Update button opacity based on disabled state
  prevButton.style("opacity", currentIndex <= 0 ? 0.4 : 1);
  nextButton.style("opacity", currentIndex >= YEARS.length - 1 ? 0.4 : 1);
}

prevButton.on("click", async () => {
  const currentIndex = YEARS.indexOf(currentYear);
  if (currentIndex > 0) {
    currentYear = YEARS[currentIndex - 1];
    yearSelect.property("value", currentYear);
    if (!divisionMode) {
      await update(currentYear);
    } else {
      await updateDivision(selectedDivision);
    }
    updateButtonStates();
  }
});

nextButton.on("click", async () => {
  const currentIndex = YEARS.indexOf(currentYear);
  if (currentIndex < YEARS.length - 1) {
    currentYear = YEARS[currentIndex + 1];
    yearSelect.property("value", currentYear);
    if (!divisionMode) {
      await update(currentYear);
    } else {
      await updateDivision(selectedDivision);
    }
    updateButtonStates();
  }
});

// Initialize button states
updateButtonStates();

// ---------- Tooltip helpers ----------

function showTooltip(event, d) {
  const rows = (d.tooltip.rows || []).map(p =>
    `<tr>
      <td style="padding:4px 8px;text-align:center">${p.Party}</td>
      <td style="padding:4px 8px;text-align:center">${p.Candidate || ''}</td>
      <td style="padding:4px 8px;text-align:center">${p.Votes || '0'}</td>
      <td style="padding:4px 8px;text-align:center">${(p.Percent).toFixed(1)}%</td>
    </tr>`
  ).join("");

  const html =
    `<div><h3 style="margin:0 0 6px 0">${d.tooltip.title}</h3>` +
    `<table style="border-collapse:collapse;font-size:12px"><thead>
      <tr>
        <th style="text-align:center">Party</th>
        <th style="text-align:center">Candidate</th>
        <th style="text-align:center">Votes</th>
        <th style="text-align:center"></th>
      </tr></thead><tbody>` +
    rows +
    `</tbody></table></div>`;

  tooltip
    .style("opacity", 1)
    .html(html);
}

function moveTooltip(event) {
  tooltip
    .style("left", `${event.clientX}px`)
    .style("top", `${event.clientY}px`);
}

function hideTooltip(event, d) {
  tooltip.style("opacity", 0);
}

// ---------- Update / render with transitions ----------
async function update(year) {
  try {
    // Load data if not already cached
    if (!DATA_BY_YEAR.has(year)) {
      const data = await makeDataset(year);
      DATA_BY_YEAR.set(year, data);
    }
    
    const data = DATA_BY_YEAR.get(year);

    // Clear arrows in year mode
    gArrows.selectAll("*").remove();

    // Data join with key for smooth transitions
    const sel = gPoints.selectAll("circle")
      .data(data, d => d.id);

  // EXIT
  sel.exit()
    .transition().duration(450)
    .attr("r", 0)
    .style("opacity", 0)
    .remove();

  // ENTER
  const enter = sel.enter()
    .append("circle")
    .attr("class", "point")
    .attr("cx", d => d.x*triW + A.x)
    .attr("cy", d => -d.y*triW + A.y)
    .attr("r", 0)
    .attr("fill", d => d.color)
    .attr("opacity", 1)
    .on("mouseover", showTooltip)
    .on("mousemove", moveTooltip)
    .on("mouseout", hideTooltip)
    .on("click", async (event, d) => {
      event.stopPropagation(); // don't trigger background clear
      
      // Switch to division mode - show all years for this division
      selectedDivision = d.division;
      divisionMode = true;
      selectedId = null;
      await updateDivision(d.division);
    });

  // ENTER + UPDATE merge
  enter.merge(sel)
    .transition().duration(650).ease(d3.easeCubicInOut)
    .attr("cx", d => d.x*triW + A.x)
    .attr("cy", d => -d.y*triW + A.y)
    .attr("r", 4)
    .attr("fill", d => d.color)
    .style("opacity", d => selectedId && d.id !== selectedId ? 0.12 : 1);

  // Apply CSS classes for selected/faded AFTER transition starts
  // (so stroke shows immediately on click)
  gPoints.selectAll("circle")
    .classed("selected", d => selectedId === d.id)
    .classed("faded", d => selectedId && d.id !== selectedId);
    
  updateButtonStates();
  } catch (error) {
    console.error(`Error updating visualization for year ${year}:`, error);
  }
}

async function updateDivision(division) {
  try {
    // Load data if not already cached
    if (!DATA_BY_DIVISION.has(division)) {
      const data = await makeDatasetByDivision(division);
      DATA_BY_DIVISION.set(division, data);
    }
    
    const data = DATA_BY_DIVISION.get(division);
    
    // Sort data by year to create chronological arrows
    const sortedData = [...data].sort((a, b) => a.year - b.year);
    
    // Create arrows between consecutive years
    const arrowData = [];
    for (let i = 0; i < sortedData.length - 1; i++) {
      const current = sortedData[i];
      const next = sortedData[i + 1];
      
      const x1 = current.x * triW + A.x;
      const y1 = -current.y * triW + A.y;
      const x2 = next.x * triW + A.x;
      const y2 = -next.y * triW + A.y;
      
      arrowData.push({
        id: `arrow_${current.year}_${next.year}`,
        x1, y1, x2, y2,
        fromYear: current.year,
        toYear: next.year,
        fromColor: current.color,
        toColor: next.color
      });
    }
    
    // Render arrows
    const arrowSel = gArrows.selectAll("path")
      .data(arrowData, d => d.id);
    
    arrowSel.exit()
      .transition().duration(300)
      .style("opacity", 0)
      .remove();
    
    const arrowEnter = arrowSel.enter()
      .append("path")
      .attr("class", "trajectory-arrow")
      .attr("fill", "none")
      .attr("stroke", d => d.fromColor)
      .attr("stroke-width", 2)
      .attr("stroke-opacity", 0.7)
      .attr("marker-end", "url(#arrowhead)")
      .style("opacity", 0)
      .on("mousemove", moveTooltip)
      .on("mouseout", hideTooltip);
    
    arrowEnter.merge(arrowSel)
      .transition().duration(650)
      .style("opacity", 1)
      .attr("stroke-width", 2)
      .attr("d", d => `M${d.x1},${d.y1}L${d.x2},${d.y2}`)
      .attr("stroke", d => d.toColor)
      .attr("marker-end", "url(#arrowhead)");

    // Data join with key for smooth transitions
    const sel = gPoints.selectAll("circle")
      .data(data, d => d.id);

    // EXIT
    sel.exit()
      .transition().duration(450)
      .attr("r", 0)
      .style("opacity", 0)
      .remove();

    // ENTER
    const enter = sel.enter()
      .append("circle")
      .attr("class", "point division-point")
      .attr("cx", d => d.x*triW + A.x)
      .attr("cy", d => -d.y*triW + A.y)
      .attr("r", 0)
      .attr("fill", d => d.color)
      .attr("opacity", 1)
      .on("mouseover", showTooltip)
      .on("mousemove", moveTooltip)
      .on("mouseout", hideTooltip)
      .on("click", async (event, d) => {
        event.stopPropagation();
        // Exit division mode and return to year view
        selectedDivision = null;
        divisionMode = false;
        selectedId = null;
        await update(currentYear);
      });

    // ENTER + UPDATE merge
    enter.merge(sel)
      .transition().duration(650).ease(d3.easeCubicInOut)
      .attr("cx", d => d.x*triW + A.x)
      .attr("cy", d => -d.y*triW + A.y)
      .attr("r", d => d.year === currentYear ? 6 : 4) // Larger radius for current year
      .attr("fill", d => d.color)
      .style("opacity", d => 1) // More opaque for current year
      .attr("stroke", d => "#333")
      .attr("stroke-width", d => 2);

    // Apply CSS classes
    gPoints.selectAll("circle")
      .classed("selected", false)
      .classed("faded", false)
      .classed("current-year", d => d.year === currentYear)
      .classed("historical-year", d => d.year !== currentYear);
      
    updateButtonStates();
  } catch (error) {
    console.error(`Error updating visualization for division ${division}:`, error);
  }
}

// initial draw
update(currentYear);
