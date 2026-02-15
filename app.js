/* Interactive ternary plot for Australian Federal Election results (D3 v7)
   Features: ternary projection, tooltips, year dropdown, animated transitions,
   click selection -> highlight + fade others.
   
   Plots electoral divisions as points where:
   - Position represents vote share distribution: Labor vs Coalition vs Others
   - Color represents winning party
   - Data sourced from Australian Electoral Commission historical results
*/

// ---------- Arbitrary example datasets ----------
async function makeDataset(year) {
  try {
    // Load JSON file for the given year
    const data = await d3.json(`Data/Compact Data/Colour-Positions/ByYear/${year}.json`)
    
    const rows = Object.entries(data).map(([key, value]) => { 
      return {
        id: key,
        year: year,
        division:key,
        color: value.colour,
        x: value.x,
        y: value.y,
      };
    });
    return rows;
  } catch (error) {
    console.error(`Error loading data for year ${year}:`, error);
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
// Data will be loaded on-demand since makeDataset is now async
const DATA_BY_YEAR = new Map();

// ---------- SVG + layout ----------
const svg = d3.select("#chart");
const tooltip = d3.select("#tooltip");

const margin = { top: 30, right: 40, bottom: 40, left: 60 };
const W = 920 - margin.left - margin.right;
const H = 680 - margin.top - margin.bottom;

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
const gPoints = g.append("g");
const gLabels = g.append("g");

// Background rect to catch “clear selection” clicks
g.append("rect")
  .attr("x", 0).attr("y", 0)
  .attr("width", 920).attr("height", 680)
  .attr("fill", "transparent")
  .lower()
  .on("click", async () => { selectedId = null; await update(currentYear); });

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
  gLabels.append("text").attr("x", A.x - 10).attr("y", A.y + 20).attr("text-anchor", "end").text("Labor");
  gLabels.append("text").attr("x", B.x + 10).attr("y", B.y + 20).attr("text-anchor", "start").text("Coalition");
  gLabels.append("text").attr("x", C.x).attr("y", C.y - 12).attr("text-anchor", "middle").text("Others");

  // Axis hints
  gLabels.append("text").attr("x", (A.x + B.x) / 2).attr("y", A.y + 40).attr("text-anchor", "middle").attr("fill", "#666")
    .text("First preference vote distribution by party");
}
drawFrame();

// ---------- UI: year dropdown ----------
const yearSelect = d3.select("#yearSelect");
yearSelect.selectAll("option")
  .data(YEARS)
  .join("option")
  .attr("value", d => d)
  .text(d => d);

let currentYear = YEARS[0];
let selectedId = null;

yearSelect.property("value", currentYear);
yearSelect.on("change", async (event) => {
  currentYear = +event.target.value;
  await update(currentYear);
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
    await update(currentYear);
    updateButtonStates();
  }
});

nextButton.on("click", async () => {
  const currentIndex = YEARS.indexOf(currentYear);
  if (currentIndex < YEARS.length - 1) {
    currentYear = YEARS[currentIndex + 1];
    yearSelect.property("value", currentYear);
    await update(currentYear);
    updateButtonStates();
  }
});

// Initialize button states
updateButtonStates();

// ---------- Tooltip helpers ----------
// function showTooltip(event, d) {
//   tooltip
//     .style("opacity", 1)
//     .html(
//       `<div><b>${d.label}</b></div>` +
//       `<div>Year: ${d.year}</div>` +
//       `<div>Winner: ${d.color}</div>` +
//       `<div>Labor: ${(d.a * 100).toFixed(1)}% | Coalition: ${(d.b * 100).toFixed(1)}% | Others: ${(d.c * 100).toFixed(1)}%</div>`
//     );
// }
      // '<div class="vote-tooltip"><h3 style="margin-top:0">{row["Division"]}, {row["State"]}, {default_year}</h3><table>'
      // + '<tr><th>Party</th><th>Vote Share</th><th>Candidate</th></tr>'
      // + ''.join(
      //     f'<tr><td>{p}</td><td>{v:.2f}</td><td>{c}</td></tr>'
      //     for p, v, c in zip(row["Party"], row["Percent"], row["Candidate"])
      // )
      // + '</table></div>'

// function moveTooltip(event) {
//   tooltip
//     .style("left", `${event.clientX}px`)
//     .style("top", `${event.clientY}px`);
// }

// function hideTooltip(event, d) {
//   tooltip.style("opacity", 0);
// }

// ---------- Update / render with transitions ----------
async function update(year) {
  try {
    // Load data if not already cached
    if (!DATA_BY_YEAR.has(year)) {
      const data = await makeDataset(year);
      DATA_BY_YEAR.set(year, data);
    }
    
    const data = DATA_BY_YEAR.get(year);

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
    // .on("mouseover", showTooltip)
    // .on("mousemove", moveTooltip)
    // .on("mouseout", hideTooltip)
    .on("click", async (event, d) => {
      event.stopPropagation(); // don't trigger background clear
      selectedId = (selectedId === d.id) ? null : d.id;
      await update(currentYear);
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

// initial draw
update(currentYear);
