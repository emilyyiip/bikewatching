
// Import Mapbox GL JS as an ES module
import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';
// Import D3 for data fetching and SVG manipulation
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

// Set your Mapbox access token here
mapboxgl.accessToken = 'pk.eyJ1IjoiZW1pbHl5aWlwIiwiYSI6ImNtN2dybm4zaDBibnkya3B2Nzdkd2lod2EifQ.-ligdlgfxpKThv7ffKCGGQ';

let timeFilter = -1;
const timeSlider = document.getElementById('time-slider');
const selectedTime = document.getElementById('selected-time');
const anyTimeLabel = document.getElementById('any-time');

function formatTime(minutes) {
  const date = new Date(0, 0, 0, 0, minutes);  // Set hours & minutes
  return date.toLocaleString('en-US', { timeStyle: 'short' }); // Format as HH:MM AM/PM
}

let stationFlow = d3.scaleQuantize().domain([0, 1]).range([0, 0.5, 1]);

let filteredTrips = [];
let filteredArrivals = new Map();
let filteredDepartures = new Map();
let filteredStations = [];

// Initialize the map
const map = new mapboxgl.Map({
  container: 'map', // ID of the div where the map will render
  style: 'mapbox://styles/mapbox/streets-v12', // Map style
  center: [-71.09415, 42.36027], // [longitude, latitude]
  zoom: 12, // Initial zoom level
  minZoom: 5, // Minimum allowed zoom
  maxZoom: 18 // Maximum allowed zoom
});
console.log('map loaded');

let circles;
function getCoords(station) {
  const point = new mapboxgl.LngLat(+station.lon, +station.lat);  // Convert lon/lat to Mapbox LngLat
  const { x, y } = map.project(point);  // Project to pixel coordinates
  return { cx: x, cy: y };  // Return as object for use in SVG attributes
}

function updatePositions() {
  circles
    .attr('cx', d => getCoords(d).cx)  // Set the x-position using projected coordinates
    .attr('cy', d => getCoords(d).cy); // Set the y-position using projected coordinates
}

map.on('load', () => { 
  const svg = d3.select('#map').select('svg');
  let stations = [];
  const jsonurl = 'station.json'
  d3.json(jsonurl).then(jsonData => {
    stations = jsonData.data.stations;
    console.log('Stations Array:', stations);
    console.log('Loaded JSON Data:', jsonData);  // Log to verify structure
    
    d3.csv('https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv', d => ({
      ride_id: d.ride_id,
      bike_type: d.bike_type,
      started_at: d.started_at,
      ended_at: d.ended_at,
      start_station_id: d.start_station_id,
      end_station_id: d.end_station_id,
      is_member: d.is_member
    })).then(trips => {
      
      console.log('Loaded CSV Data:', trips);
      
      for (let trip of trips) {
        trip.started_at = new Date(trip.started_at);
        trip.ended_at = new Date(trip.ended_at);
      }

      function minutesSinceMidnight(date) {
        return date.getHours() * 60 + date.getMinutes();
      }

      function mixColors(departureRatio) {
        let color1 = [70, 130, 180]; // Steelblue (Departures)
        let color2 = [255, 140, 0]; // Darkorange (Arrivals)
    
        let mixedColor = color1.map((c, i) =>
            Math.round(c * departureRatio + color2[i] * (1 - departureRatio))
        );
    
        return `rgb(${mixedColor.join(",")})`;
    }
    
    function filterTripsbyTime() {
        filteredTrips = timeFilter === -1
            ? trips
            : trips.filter((trip) => {
                const startedMinutes = minutesSinceMidnight(trip.started_at);
                const endedMinutes = minutesSinceMidnight(trip.ended_at);
                return (
                    Math.abs(startedMinutes - timeFilter) <= 60 ||
                    Math.abs(endedMinutes - timeFilter) <= 60
                );
            });
    
        filteredDepartures = d3.rollup(filteredTrips, v => v.length, d => d.start_station_id);
        filteredArrivals = d3.rollup(filteredTrips, v => v.length, d => d.end_station_id);
    
        filteredStations = stations.map((station) => {
            let id = station.short_name;
            station = { ...station };
            station.arrivals = filteredArrivals.get(id) ?? 0;
            station.departures = filteredDepartures.get(id) ?? 0;
            station.totalTraffic = station.arrivals + station.departures;
            return station;
        });
    
        const radiusScale = d3.scaleSqrt()
            .domain([0, d3.max(filteredStations, (d) => d.totalTraffic)])
            .range([3, 30]);
    
        svg.selectAll('circle').remove();
        circles = svg.selectAll('circle')
            .data(filteredStations)
            .enter()
            .append('circle')
            .attr('r', (d) => radiusScale(d.totalTraffic))  // Set radius
            .attr("fill", d => mixColors(d.departures / (d.totalTraffic || 1))) // Set computed color
            .each(function (d) {
                d3.select(this)
                    .append('title')
                    .text(`${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`);
            });
    
        updatePositions();
    }    

      function updateTimeDisplay() {
        timeFilter = Number(timeSlider.value);  
      
        if (timeFilter === -1) {
          selectedTime.textContent = '';  // Clear time display
          anyTimeLabel.style.display = 'block';  // Show "(any time)"
        } else {
          selectedTime.textContent = formatTime(timeFilter);  // Display formatted time
          anyTimeLabel.style.display = 'none';  // Hide "(any time)"
        }
      

        filterTripsbyTime();
      }
      updateTimeDisplay(); //puts the circles on the map
      timeSlider.addEventListener('input', updateTimeDisplay);
    
      // Initial position update when map loads
      updatePositions();
        // Reposition markers on map interactions
      map.on('move', updatePositions);     // Update during map movement
      map.on('zoom', updatePositions);     // Update during zooming
      map.on('resize', updatePositions);   // Update on window resize
      map.on('moveend', updatePositions);  // Final adjustment after movement ends

    });
    
  }).catch(error => {
    console.error('Error loading JSON:', error);  // Handle errors if JSON loading fails
  });

  // add boston route
  map.addSource('boston_route', {
    type: 'geojson',
    data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson?...'
  });

  map.addLayer({
    id: 'boston-bike-lanes',
    type: 'line',
    source: 'boston_route',
    paint: {
      'line-color': '#32D400',  // A bright green using hex code
      'line-width': 5,          // Thicker lines
      'line-opacity': 0.6       // Slightly less transparent
    }
  });

  // add cambridge route
  map.addSource('cambridge_route', {
    type: 'geojson',
    data: 'https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson'
  });

  map.addLayer({
    id: 'cam-bike-lanes',
    type: 'line',
    source: 'cambridge_route',
    paint: {
      'line-color': '#32D400',  // A bright green using hex code
      'line-width': 5,          // Thicker lines
      'line-opacity': 0.6       // Slightly less transparent
    }
  });

  
  
});