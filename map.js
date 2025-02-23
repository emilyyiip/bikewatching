
// Import Mapbox GL JS as an ES module
import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';
// Import D3 for data fetching and SVG manipulation
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

// Set your Mapbox access token here
mapboxgl.accessToken = 'pk.eyJ1IjoiZW1pbHl5aWlwIiwiYSI6ImNtN2dybm4zaDBibnkya3B2Nzdkd2lod2EifQ.-ligdlgfxpKThv7ffKCGGQ';

// Initialize the Mapbox map
const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/streets-v12',
  center: [-71.09415, 42.36027],
  zoom: 12,
  minZoom: 5,
  maxZoom: 18,
});
console.log("Mapbox GL JS Loaded:", mapboxgl);

// ---------------------
// Global helper functions
// ---------------------

// Format a given number of minutes into a HH:MM AM/PM string
function formatTime(minutes) {
  const date = new Date(0, 0, 0, 0, minutes);
  return date.toLocaleString('en-US', { timeStyle: 'short' });
}

// Convert a Date object into minutes since midnight
function minutesSinceMidnight(date) {
  return date.getHours() * 60 + date.getMinutes();
}

// Get pixel coordinates for a station (using its Long and Lat)
function getCoords(station) {
  const point = new mapboxgl.LngLat(+station.Long, +station.Lat);
  const { x, y } = map.project(point);
  return { cx: x, cy: y };
}

// ---------------------
// Data Bucketing for Performance
// ---------------------

// Create 1440 buckets (one per minute) for departures and arrivals
let departuresByMinute = Array.from({ length: 1440 }, () => []);
let arrivalsByMinute = Array.from({ length: 1440 }, () => []);

// ---------------------
// Traffic Flow Color Scale
// ---------------------

// A quantize scale mapping ratios (0 to 1) to discrete values (for color interpolation)
let stationFlow = d3.scaleQuantize().domain([0, 1]).range([0, 0.5, 1]);

// ---------------------
// Global Variables to Hold Data and Selections
// ---------------------

let circles;       // D3 selection for station circles
let allStations;   // Loaded station data

// ---------------------
// Compute Station Traffic
// ---------------------

function computeStationTraffic(stations, timeFilter = -1) {
  // Retrieve trips efficiently from pre-bucketed arrays
  const filteredDepartures = filterByMinute(departuresByMinute, timeFilter);
  const filteredArrivals = filterByMinute(arrivalsByMinute, timeFilter);

  // Count departures per station using d3.rollup
  const departures = d3.rollup(
    filteredDepartures,
    v => v.length,
    d => d.start_station_id
  );
  // Count arrivals per station
  const arrivals = d3.rollup(
    filteredArrivals,
    v => v.length,
    d => d.end_station_id
  );

  // Update each station with traffic counts
  return stations.map(station => {
    let id = station.short_name; // Assumes station objects have a short_name property
    station.departures = departures.get(id) || 0;
    station.arrivals = arrivals.get(id) || 0;
    station.totalTraffic = station.departures + station.arrivals;
    return station;
  });
}

// ---------------------
// Filter Trips by Minute Using Buckets
// ---------------------

function filterByMinute(tripsByMinute, minute) {
  if (minute === -1) {
    return tripsByMinute.flat();
  }
  let minMinute = (minute - 60 + 1440) % 1440;
  let maxMinute = (minute + 60) % 1440;
  if (minMinute > maxMinute) {
    let beforeMidnight = tripsByMinute.slice(minMinute);
    let afterMidnight = tripsByMinute.slice(0, maxMinute);
    return beforeMidnight.concat(afterMidnight).flat();
  } else {
    return tripsByMinute.slice(minMinute, maxMinute).flat();
  }
}

// ---------------------
// Main Map and Data Loading
// ---------------------

map.on('load', async () => {
  // --- Step 2: Adding Bike Lanes ---
  map.addSource('boston_route', {
    type: 'geojson',
    data:
      'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson',
  });
  map.addLayer({
    id: 'bike-lanes',
    type: 'line',
    source: 'boston_route',
    paint: {
      'line-color': '#32D400',
      'line-width': 5,
      'line-opacity': 0.6,
    },
  });

  // --- Step 3: Adding Bluebikes Stations ---
  // Load station data from JSON
  const stationData = await d3.json(
    'https://dsc106.com/labs/lab07/data/bluebikes-stations.json'
  );
  // Assume station objects are located at data.stations
  let stations = stationData.data.stations;
  allStations = stations; // Save globally for updates

  // Select the SVG element inside the map container
  const svg = d3.select('#map').select('svg');

  // Create initial circles for each station (using station.short_name as key)
  circles = svg
    .selectAll('circle')
    .data(stations, (d) => d.short_name)
    .enter()
    .append('circle')
    .attr('r', 5)
    .attr('fill', 'steelblue')
    .attr('stroke', 'white')
    .attr('stroke-width', 1)
    .attr('opacity', 0.8)
    .each(function (d) {
      d3.select(this).append('title').text(`${d.totalTraffic || 0} trips`);
    });

  // Update circle positions as the map moves/zooms
  function updatePositions() {
    circles
      .attr('cx', (d) => getCoords(d).cx)
      .attr('cy', (d) => getCoords(d).cy);
  }
  updatePositions();
  map.on('move', updatePositions);
  map.on('zoom', updatePositions);
  map.on('resize', updatePositions);
  map.on('moveend', updatePositions);

  // --- Step 4: Visualizing Bike Traffic ---
  // Load traffic CSV data and parse date strings; bucket trips by minute
  let trips = await d3.csv(
    'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv',
    (trip) => {
      trip.started_at = new Date(trip.started_at);
      trip.ended_at = new Date(trip.ended_at);
      // Bucket trips by departure and arrival minute
      const startMin = minutesSinceMidnight(trip.started_at);
      const endMin = minutesSinceMidnight(trip.ended_at);
      departuresByMinute[startMin].push(trip);
      arrivalsByMinute[endMin].push(trip);
      return trip;
    }
  );

  // Create a square-root scale for circle radii
  let radiusScale = d3
    .scaleSqrt()
    .domain([0, d3.max(stations, (d) => d.totalTraffic || 1)])
    .range([0, 25]);

  // --- Step 5: Interactive Data Filtering ---
  // Select slider and time display elements
  const timeSlider = document.getElementById('time-slider');
  const selectedTime = document.getElementById('selected-time');
  const anyTimeLabel = document.getElementById('any-time');

  function updateTimeDisplay() {
    let timeFilter = Number(timeSlider.value);
    if (timeFilter === -1) {
      selectedTime.textContent = '';
      anyTimeLabel.style.display = 'block';
    } else {
      selectedTime.textContent = formatTime(timeFilter);
      anyTimeLabel.style.display = 'none';
    }
    updateScatterPlot(timeFilter);
  }
  timeSlider.addEventListener('input', updateTimeDisplay);
  updateTimeDisplay();

  // Function to update the scatterplot (circle sizes and tooltips) based on time filter
  function updateScatterPlot(timeFilter) {
    // Adjust radius scale range when filtering so markers remain visible
    timeFilter === -1
      ? radiusScale.range([0, 25])
      : radiusScale.range([3, 50]);

    // Recompute station traffic using the timeFilter (which uses bucketed trips)
    const updatedStations = computeStationTraffic(allStations, timeFilter);

    // Update circles with new data; using station.short_name as key ensures smooth transitions
    circles = svg
      .selectAll('circle')
      .data(updatedStations, (d) => d.short_name)
      .join('circle')
      .attr('cx', (d) => getCoords(d).cx)
      .attr('cy', (d) => getCoords(d).cy)
      .attr('r', (d) => radiusScale(d.totalTraffic))
      .each(function (d) {
        // Update tooltip for each marker
        d3.select(this).select('title').remove();
        d3.select(this)
          .append('title')
          .text(
            `${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`
          );
      })
      // Set a CSS custom property for color based on the ratio of departures
      .style(
        '--departure-ratio',
        (d) => stationFlow(d.totalTraffic ? d.departures / d.totalTraffic : 0)
      );
  }

  // --- Step 6: Visualizing Traffic Flow with Color ---
  // Our CSS uses the custom property --departure-ratio to mix colors.
  // The updateScatterPlot() function sets this property so that the fill color (via CSS variable)
  // changes based on the proportion of departures vs. arrivals.
});
