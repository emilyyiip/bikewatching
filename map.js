
// Import Mapbox GL JS as an ES module
import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';
// Import D3 for data fetching and SVG manipulation
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

// Set your Mapbox access token here
mapboxgl.accessToken = 'pk.eyJ1IjoiZW1pbHl5aWlwIiwiYSI6ImNtN2dybm4zaDBibnkya3B2Nzdkd2lod2EifQ.-ligdlgfxpKThv7ffKCGGQ';

// Initialize the Mapbox map
const map = new mapboxgl.Map({
  container: 'map', // The id of the HTML element to render the map into
  style: 'mapbox://styles/mapbox/streets-v12', // Map style URL (you can customize this style in Mapbox Studio)
  center: [-71.09415, 42.36027], // [longitude, latitude] (center on Boston)
  zoom: 12, // Initial zoom level
  minZoom: 5, // Minimum zoom allowed
  maxZoom: 18 // Maximum zoom allowed
});

// Log to verify Mapbox GL JS is loaded
console.log("Mapbox GL JS Loaded:", mapboxgl);

// Wait for the map to fully load before adding sources and layers
map.on('load', async () => {
  // --- Step 2: Adding Bike Lanes ---

  // Add Boston bike lanes as a GeoJSON source
  map.addSource('boston_route', {
    type: 'geojson',
    data:
      'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson'
  });

  // Add a layer to visualize the bike lanes
  map.addLayer({
    id: 'bike-lanes',
    type: 'line',
    source: 'boston_route',
    paint: {
      'line-color': '#32D400', // Bright green (hex color)
      'line-width': 5,         // Thicker lines
      'line-opacity': 0.6        // 60% opacity
    }
  });

  // OPTIONAL: To add Cambridge bike lanes, follow a similar procedure:
  // map.addSource('cambridge_route', { ... });
  // map.addLayer({ id: 'cambridge-bike-lanes', ... });

  // --- Step 3: Adding Bluebikes Stations ---

  // Use D3 to load the Bluebikes station data JSON
  try {
    // URL for the Bluebikes station data
    const jsonurl = 'https://dsc106.com/labs/lab07/data/bluebikes-stations.json';
    const jsonData = await d3.json(jsonurl);
    console.log('Loaded JSON Data:', jsonData);

    // The station data is nested within the JSON structure (adjust this if needed)
    let stations = jsonData.data.stations;
    console.log('Stations Array:', stations);

    // Select the SVG element within the map container
    const svg = d3.select('#map').select('svg');

    // Define a helper function to convert station coordinates (longitude, latitude)
    // into pixel coordinates using Mapbox's map.project()
    function getCoords(station) {
      // Use the station’s Long and Lat values (ensure they are numbers)
      const point = new mapboxgl.LngLat(+station.Long, +station.Lat);
      const { x, y } = map.project(point);
      return { cx: x, cy: y };
    }

    // Append a circle for each station using D3's enter() pattern
    const circles = svg
      .selectAll('circle')
      .data(stations)
      .enter()
      .append('circle')
      .attr('r', 5) // Radius of each circle
      .attr('fill', 'steelblue') // Fill color
      .attr('stroke', 'white')   // Border color
      .attr('stroke-width', 1)   // Border thickness
      .attr('opacity', 0.8);     // Circle opacity

    // Function to update circle positions based on the map's current view
    function updatePositions() {
      circles
        .attr('cx', d => getCoords(d).cx)
        .attr('cy', d => getCoords(d).cy);
    }

    // Initial update after markers are added
    updatePositions();

    // Recalculate marker positions on map interactions so that they stay in sync with the map:
    map.on('move', updatePositions);
    map.on('zoom', updatePositions);
    map.on('resize', updatePositions);
    map.on('moveend', updatePositions);

  } catch (error) {
    console.error('Error loading JSON:', error);
  }
});
