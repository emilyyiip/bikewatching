
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

map.on('load', async () => { 
  map.addSource('boston_route', {
      type: 'geojson',
      data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson'
  });
  map.addLayer({
      id: 'boston-bike-lanes',
      type: 'line',
      source: 'boston_route',
      paint: {
          'line-color': 'green',
          'line-width': 3,
          'line-opacity': 0.6
      }
  });

  map.addSource('cambridge_route', {
      type: 'geojson',
      data: 'https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson'
  });
  map.addLayer({
      id: 'cambridge-bike-lanes',
      type: 'line',
      source: 'cambridge_route',
      paint: {
          'line-color': 'green',
          'line-width': 3,
          'line-opacity': 0.6
      }
  });

  const svg = d3.select('#map').select('svg');
  
  // ✅ Create Tooltip
  const tooltip = d3.select("body").append("div")
      .attr("id", "tooltip")
      .style("position", "absolute")
      .style("background-color", "white")
      .style("padding", "8px")
      .style("border-radius", "5px")
      .style("box-shadow", "0px 0px 5px rgba(0,0,0,0.3)")
      .style("font-size", "14px")
      .style("display", "none")
      .style("pointer-events", "none");

  try {
      const jsonurl = "https://dsc106.com/labs/lab07/data/bluebikes-stations.json";
      const jsonData = await d3.json(jsonurl);
      console.log('Loaded JSON Data:', jsonData);

      const csvurl = "https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv";
      let trips = await d3.csv(csvurl, trip => {
          trip.started_at = new Date(trip.started_at);
          trip.ended_at = new Date(trip.ended_at);
          return trip;
      });

      console.log('Loaded CSV Data:', trips);

      let stations = computeStationTraffic(jsonData.data.stations);
      console.log('Stations Array:', stations);

      const departures = d3.rollup(trips, v => v.length, d => d.start_station_id);
      const arrivals = d3.rollup(trips, v => v.length, d => d.end_station_id);

      stations = stations.map(station => {
          let id = station.short_name;
          station.arrivals = arrivals.get(id) ?? 0;
          station.departures = departures.get(id) ?? 0;
          station.totalTraffic = station.arrivals + station.departures;
          return station;
      });

      const radiusScale = d3.scaleSqrt()
          .domain([0, d3.max(stations, d => d.totalTraffic)])
          .range([0, 25]);

      let stationFlow = d3.scaleQuantize().domain([0, 1]).range([0, 0.5, 1]);

      const circles = svg.selectAll('circle')
          .data(stations, d => d.short_name)
          .enter()
          .append('circle')
          .attr('r', d => radiusScale(d.totalTraffic))
          .attr('fill', 'steelblue')
          .attr('stroke', 'white')
          .attr('stroke-width', 1)
          .attr('opacity', 0.8)
          .style("--departure-ratio", d => stationFlow(d.departures / d.totalTraffic))
          // ✅ Tooltip Event Listeners
          .on("mouseover", (event, d) => {
              tooltip.style("display", "block")
                  .html(`
                      <strong>${d.short_name}</strong><br>
                      ${d.totalTraffic} trips<br>
                      ${d.departures} departures<br>
                      ${d.arrivals} arrivals
                  `);
          })
          .on("mousemove", (event) => {
              tooltip.style("left", `${event.pageX + 10}px`)
                  .style("top", `${event.pageY - 20}px`);
          })
          .on("mouseout", () => {
              tooltip.style("display", "none");
          });

      function updatePositions() {
          circles
              .attr('cx', d => getCoords(d).cx)
              .attr('cy', d => getCoords(d).cy);
      }

      updatePositions();

      map.on('move', updatePositions);
      map.on('zoom', updatePositions);
      map.on('resize', updatePositions);
      map.on('moveend', updatePositions);

      const timeSlider = document.getElementById('time-slider');
      const selectedTime = document.getElementById('selected-time');
      const anyTimeLabel = document.getElementById('any-time');

      function updateTimeDisplay() {
          const timeFilter = Number(timeSlider.value);

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

      function updateScatterPlot(timeFilter) {
          timeFilter === -1 ? radiusScale.range([0, 25]) : radiusScale.range([3, 50]);

          const filteredStations = computeStationTraffic(stations, timeFilter);

          circles
              .data(filteredStations, d => d.short_name)
              .join('circle')
              .attr('r', d => radiusScale(d.totalTraffic))
              .style('--departure-ratio', d => stationFlow(d.departures / d.totalTraffic));
      }

  } catch (error) {
      console.error('Error loading data:', error);
  }
});

let departuresByMinute = Array.from({ length: 1440 }, () => []);
let arrivalsByMinute = Array.from({ length: 1440 }, () => []);

function getCoords(station) {
  const point = new mapboxgl.LngLat(+station.lon, +station.lat);
  const { x, y } = map.project(point);
  return { cx: x, cy: y };
}

function formatTime(minutes) {
  const date = new Date(0, 0, 0, 0, minutes);
  return date.toLocaleString('en-US', { timeStyle: 'short' });
}

function computeStationTraffic(stations, timeFilter = -1) {
  const departures = d3.rollup(
      filterByMinute(departuresByMinute, timeFilter),
      v => v.length,
      d => d.start_station_id
  );

  const arrivals = d3.rollup(
      filterByMinute(arrivalsByMinute, timeFilter),
      v => v.length,
      d => d.end_station_id
  );

  return stations.map(station => {
      let id = station.short_name;
      station.arrivals = arrivals.get(id) ?? 0;
      station.departures = departures.get(id) ?? 0;
      station.totalTraffic = station.arrivals + station.departures;
      return station;
  });
}

function filterByMinute(tripsByMinute, minute) {
  if (minute === -1) return tripsByMinute.flat();

  let minMinute = (minute - 60 + 1440) % 1440;
  let maxMinute = (minute + 60) % 1440;

  if (minMinute > maxMinute) {
      return tripsByMinute.slice(minMinute).concat(tripsByMinute.slice(0, maxMinute)).flat();
  } else {
      return tripsByMinute.slice(minMinute, maxMinute).flat();
  }
}
