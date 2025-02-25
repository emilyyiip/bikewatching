
// Import Mapbox GL JS as an ES module
import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';
// Import D3 for data fetching and SVG manipulation
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

// Set your Mapbox access token here
mapboxgl.accessToken = 'pk.eyJ1IjoiZW1pbHl5aWlwIiwiYSI6ImNtN2dybm4zaDBibnkya3B2Nzdkd2lod2EifQ.-ligdlgfxpKThv7ffKCGGQ';


const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/streets-v12',
  center: [-71.09415, 42.36027],
  zoom: 12,
  minZoom: 5,
  maxZoom: 18
});

let timeFilter = -1;
const timeSlider = document.getElementById('time-slider');
const selectedTime = document.getElementById('selected-time');
const anyTimeLabel = document.getElementById('any-time');

function formatTime(minutes) {
  const date = new Date(0, 0, 0, 0, minutes);
  return date.toLocaleString('en-US', { timeStyle: 'short' });
}

let stationFlow = d3.scaleQuantize().domain([0, 1]).range([0, 0.5, 1]);

map.on('load', async () => {
  const svg = d3.select('#map').select('svg');

  let stations = await d3.json('https://dsc106.com/labs/lab07/data/bluebikes-stations.json');
  stations = stations.data.stations;

  let trips = await d3.csv('https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv', d => ({
    ride_id: d.ride_id,
    started_at: new Date(d.started_at),
    ended_at: new Date(d.ended_at),
    start_station_id: d.start_station_id,
    end_station_id: d.end_station_id
  }));

  function minutesSinceMidnight(date) {
    return date.getHours() * 60 + date.getMinutes();
  }
  function filterTripsbyTime() {
    filteredTrips = timeFilter === -1
        ? trips
        : trips.filter(trip => {
            const startMin = minutesSinceMidnight(trip.started_at);
            const endMin = minutesSinceMidnight(trip.ended_at);
            return Math.abs(startMin - timeFilter) <= 60 || Math.abs(endMin - timeFilter) <= 60;
        });

    filteredDepartures = d3.rollup(filteredTrips, v => v.length, d => d.start_station_id);
    filteredArrivals = d3.rollup(filteredTrips, v => v.length, d => d.end_station_id);

    filteredStations = stations.map(station => ({
        ...station,
        arrivals: filteredArrivals.get(station.short_name) ?? 0,
        departures: filteredDepartures.get(station.short_name) ?? 0,
        totalTraffic: (filteredArrivals.get(station.short_name) ?? 0) + (filteredDepartures.get(station.short_name) ?? 0)
    }));

    updateScatterPlot(); // 🛠 Update the visualization after filtering
}


  function updateScatterPlot() {
    const radiusScale = d3.scaleSqrt()
      .domain([0, d3.max(stations, d => d.totalTraffic)])
      .range([3, 50]);

    const circles = svg.selectAll('circle')
      .data(stations, d => d.short_name)
      .join('circle')
      .attr('r', d => radiusScale(d.totalTraffic))
      .style('--departure-ratio', d => stationFlow(d.departures / d.totalTraffic));

    updatePositions();
  }

  function updatePositions() {
    svg.selectAll('circle')
      .attr('cx', d => map.project([+d.Long, +d.Lat]).x)
      .attr('cy', d => map.project([+d.Long, +d.Lat]).y);
  }

  function updateTimeDisplay() {
    timeFilter = Number(timeSlider.value);  

    if (timeFilter === -1) {
        selectedTime.textContent = '';  
        anyTimeLabel.style.display = 'block';  
    } else {
        selectedTime.textContent = formatTime(timeFilter);  
        anyTimeLabel.style.display = 'none';  
    }

    // 🛠 Force a re-computation of station traffic & update scatter plot
    filterTripsbyTime();
    updateScatterPlot();
}

  updateTimeDisplay();
  timeSlider.addEventListener('input', updateTimeDisplay);
  map.on('move', updatePositions);
});