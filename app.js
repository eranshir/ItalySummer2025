// Global variables
let itineraryData = [];
let map;
let markers = [];
let routes = []; // Array to store route polylines
let markerToItemMap = new Map(); // Maps markers to itinerary items
let itemToMarkerMap = new Map(); // Maps itinerary items to markers
let currentFilter = { region: '', date: '', search: '' };
let dayColors = []; // Array of colors for each day
let notesData = {}; // Storage for location notes
let currentNotesLocation = null; // Currently selected location for notes

// Mapbox configuration
const MAPBOX_TOKEN = 'pk.eyJ1IjoiZXJhbnNoaXIiLCJhIjoiY20zejNvdnl0MXV3MDJpcXR0NGRwcDUxMSJ9.ynB1eQhqRa9c22fNncfQsQ';

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    initializeTabs();
    initializeMap();
    loadItineraryData();
    initializeFilters();
    initializeMobileOptimizations();
    initializeNotesDrawer();
    loadNotesData();
});

// Tab functionality
function initializeTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.getAttribute('data-tab');
            
            // Remove active class from all tabs and contents
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));
            
            // Add active class to clicked tab and corresponding content
            button.classList.add('active');
            document.getElementById(`${tabId}-tab`).classList.add('active');
            
            // Resize map if map tab is selected
            if (tabId === 'map' && map) {
                setTimeout(() => map.invalidateSize(), 100);
            }
        });
    });
}

// Initialize Leaflet map
function initializeMap() {
    map = L.map('map').setView([46.0, 10.0], 8);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);
}


// Generate colors for each day
function generateDayColors() {
    const uniqueDates = [...new Set(itineraryData.map(item => item.Date))].sort();
    const baseColors = [
        '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FECA57',
        '#FF9FF3', '#54A0FF', '#5F27CD', '#00D2D3', '#FF9F43',
        '#6C5CE7', '#A29BFE', '#FD79A8', '#E17055', '#81ECEC',
        '#74B9FF'
    ];
    
    dayColors = uniqueDates.map((date, index) => ({
        date: date,
        color: baseColors[index % baseColors.length]
    }));
}

// Get color for a specific date
function getColorForDate(date) {
    const dayColor = dayColors.find(dc => dc.date === date);
    return dayColor ? dayColor.color : '#667eea';
}

// Create colored marker icon
function createColoredMarkerIcon(color) {
    return L.divIcon({
        html: `<div style="
            width: 24px;
            height: 24px;
            border-radius: 50%;
            background-color: ${color};
            border: 3px solid white;
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            position: relative;
        "></div>`,
        className: 'custom-marker',
        iconSize: [24, 24],
        iconAnchor: [12, 12]
    });
}

// Load and parse CSV data
function loadItineraryData() {
    Papa.parse('./northern_italy_trip_itinerary_revised.csv', {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: function(results) {
            itineraryData = results.data.filter(row => row.Date); // Filter out empty rows
            generateDayColors();
            populateDateFilter();
            addClearFiltersButton();
            createMapMarkers();
            createDrivingRoutes();
            renderTimeline();
            renderItinerary();
        },
        error: function(error) {
            console.error('Error loading CSV:', error);
        }
    });
}

// Create map markers from itinerary data
function createMapMarkers() {
    // Clear existing markers
    markers.forEach(marker => map.removeLayer(marker));
    markers = [];

    // Group activities by location to avoid overlapping markers
    const locationGroups = {};
    
    itineraryData.forEach((item, index) => {
        if (item.Coordinates) {
            const coords = item.Coordinates.split(',');
            if (coords.length === 2) {
                const lat = parseFloat(coords[0].trim());
                const lng = parseFloat(coords[1].trim());
                
                if (!isNaN(lat) && !isNaN(lng)) {
                    const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
                    
                    if (!locationGroups[key]) {
                        locationGroups[key] = {
                            lat: lat,
                            lng: lng,
                            activities: []
                        };
                    }
                    
                    locationGroups[key].activities.push({
                        ...item,
                        index: index
                    });
                }
            }
        }
    });

    // Create markers for each location group
    Object.values(locationGroups).forEach(group => {
        // Use the color from the first activity's date for this location
        const firstActivity = group.activities[0];
        const markerColor = getColorForDate(firstActivity.Date);
        const coloredIcon = createColoredMarkerIcon(markerColor);
        
        const marker = L.marker([group.lat, group.lng], { icon: coloredIcon })
            .addTo(map)
            .on('click', () => {
                showLocationDetails(group.activities);
                highlightItineraryItems(group.activities);
            });
        
        markers.push(marker);
        
        // Store mapping between markers and items
        markerToItemMap.set(marker, group.activities);
        group.activities.forEach(activity => {
            itemToMarkerMap.set(activity.index, marker);
        });
    });
    
    // Fit map to show all markers
    if (markers.length > 0) {
        const group = new L.featureGroup(markers);
        map.fitBounds(group.getBounds().pad(0.1));
    }
}

// Create driving routes between locations using Mapbox
async function createDrivingRoutes() {
    // Clear existing routes
    routes.forEach(route => map.removeLayer(route));
    routes = [];
    
    // Find driving activities and create routes
    for (let i = 0; i < itineraryData.length; i++) {
        const currentItem = itineraryData[i];
        
        // Check if this is a driving activity
        if (isDrivingActivity(currentItem)) {
            const routeCoords = extractRouteCoordinates(currentItem);
            
            if (routeCoords.length >= 2) {
                const routeColor = getColorForDate(currentItem.Date);
                
                try {
                    // Fetch actual route from Mapbox
                    const routeData = await fetchMapboxRoute(routeCoords, routeColor, currentItem);
                    if (routeData) {
                        routes.push(routeData);
                    }
                } catch (error) {
                    console.error('Error fetching route:', error);
                    // Fallback to straight line if API fails
                    createFallbackRoute(routeCoords, routeColor, currentItem);
                }
            }
        }
    }
}

// Check if an activity is a driving activity
function isDrivingActivity(item) {
    const activity = item.Activity.toLowerCase();
    const location = item.Location.toLowerCase();
    const notes = item.Notes.toLowerCase();
    
    return (
        activity.includes('drive') ||
        activity.includes('driving') ||
        location.includes('drive') ||
        location.includes('→') ||
        location.includes('->') ||
        notes.includes('drive') ||
        notes.includes('hr drive') ||
        notes.includes('hour drive')
    );
}

// Extract coordinates for a route from the activity
function extractRouteCoordinates(driveItem) {
    const coords = [];
    
    // If the drive item has coordinates, use them as the end point
    if (driveItem.Coordinates) {
        const driveCoords = driveItem.Coordinates.split(',');
        if (driveCoords.length === 2) {
            const lat = parseFloat(driveCoords[0].trim());
            const lng = parseFloat(driveCoords[1].trim());
            if (!isNaN(lat) && !isNaN(lng)) {
                coords.push([lat, lng]);
            }
        }
    }
    
    // Look for the previous non-driving location as start point
    const currentIndex = itineraryData.indexOf(driveItem);
    for (let i = currentIndex - 1; i >= 0; i--) {
        const prevItem = itineraryData[i];
        if (!isDrivingActivity(prevItem) && prevItem.Coordinates) {
            const prevCoords = prevItem.Coordinates.split(',');
            if (prevCoords.length === 2) {
                const lat = parseFloat(prevCoords[0].trim());
                const lng = parseFloat(prevCoords[1].trim());
                if (!isNaN(lat) && !isNaN(lng)) {
                    coords.unshift([lat, lng]); // Add to beginning
                    break;
                }
            }
        }
    }
    
    // Look for the next non-driving location as end point if we don't have drive coordinates
    if (coords.length < 2) {
        for (let i = currentIndex + 1; i < itineraryData.length; i++) {
            const nextItem = itineraryData[i];
            if (!isDrivingActivity(nextItem) && nextItem.Coordinates) {
                const nextCoords = nextItem.Coordinates.split(',');
                if (nextCoords.length === 2) {
                    const lat = parseFloat(nextCoords[0].trim());
                    const lng = parseFloat(nextCoords[1].trim());
                    if (!isNaN(lat) && !isNaN(lng)) {
                        coords.push([lat, lng]);
                        break;
                    }
                }
            }
        }
    }
    
    return coords;
}


// Show location details when marker is clicked
function showLocationDetails(activities) {
    const detailsContainer = document.getElementById('location-details');
    
    if (activities.length === 1) {
        const activity = activities[0];
        detailsContainer.innerHTML = `
            <h3>${activity.Location}</h3>
            <div class="date-time">
                <div>
                    <span class="date">${formatDate(activity.Date)}</span>
                    <span class="time">${activity['Time Range']}</span>
                </div>
                ${activity.Sunrise && activity.Sunset ? 
                    `<div class="sun-info">🌅 ${activity.Sunrise} | 🌇 ${activity.Sunset}</div>` 
                    : ''}
            </div>
            <h4>${activity.Activity}</h4>
            <p>${activity.Notes}</p>
            ${activity['Google Maps URL'] ? 
                `<a href="${activity['Google Maps URL']}" target="_blank" class="maps-link">📍 Open in Google Maps</a>` 
                : ''}
        `;
    } else {
        detailsContainer.innerHTML = `
            <h3>${activities[0].Location}</h3>
            <p>Multiple activities at this location:</p>
            <div class="activity-list">
                ${activities.map(activity => `
                    <div class="activity-item">
                        <div class="date-time">
                            <span class="date">${formatDate(activity.Date)}</span>
                            <span class="time">${activity['Time Range']}</span>
                        </div>
                        <h4>${activity.Activity}</h4>
                        <p>${activity.Notes}</p>
                    </div>
                `).join('')}
            </div>
            ${activities[0]['Google Maps URL'] ? 
                `<a href="${activities[0]['Google Maps URL']}" target="_blank" class="maps-link">📍 Open in Google Maps</a>` 
                : ''}
        `;
    }
}

// Render timeline view
function renderTimeline() {
    renderTimelineWithData(itineraryData);
}

// Render timeline view with specific data
function renderTimelineWithData(data) {
    const timelineContainer = document.getElementById('timeline');
    
    // Group activities by date
    const dayGroups = {};
    data.forEach((item) => {
        const originalIndex = itineraryData.indexOf(item);
        if (!dayGroups[item.Date]) {
            dayGroups[item.Date] = [];
        }
        dayGroups[item.Date].push({...item, index: originalIndex});
    });
    
    let timelineHTML = '';
    Object.keys(dayGroups).sort().forEach(date => {
        const activities = dayGroups[date];
        const dayName = activities[0].Day;
        const dayColor = getColorForDate(date);
        
        const firstActivity = activities[0];
        timelineHTML += `
            <div class="timeline-day">
                <div class="timeline-date">
                    <div class="date-color-indicator" style="background-color: ${dayColor};"></div>
                    <h3 style="color: ${dayColor};">${formatDate(date)}</h3>
                    <span class="day-name">${dayName}</span>
                    ${firstActivity.Sunrise && firstActivity.Sunset ? 
                        `<div class="timeline-sun-info">🌅 ${firstActivity.Sunrise} | 🌇 ${firstActivity.Sunset}</div>` 
                        : ''}
                </div>
                <div class="timeline-activities">
                    ${activities.map(activity => `
                        <div class="timeline-activity ${hasNotes(activity) ? 'has-notes' : ''}" onclick="openNotesDrawer('${activity.Location}', '${activity.Activity}', ${activity.index})" style="border-left: 4px solid ${dayColor};">
                            <div class="time">${activity['Time Range']}</div>
                            <div class="activity-content">
                                <h4>${activity.Location}</h4>
                                <p class="activity-title">${activity.Activity}</p>
                                <p class="activity-notes">${activity.Notes}</p>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    });
    
    timelineContainer.innerHTML = timelineHTML;
}

// Render itinerary list view
function renderItinerary() {
    renderItineraryWithData(itineraryData);
}

// Render itinerary list view with specific data
function renderItineraryWithData(data) {
    const itineraryContainer = document.getElementById('itinerary-list');
    
    let itineraryHTML = '';
    data.forEach((item) => {
        const originalIndex = itineraryData.indexOf(item);
        const itemColor = getColorForDate(item.Date);
        itineraryHTML += `
            <div class="itinerary-item" data-index="${originalIndex}" onclick="focusOnMapLocation(${originalIndex})" style="border-left: 4px solid ${itemColor};">
                <div class="itinerary-header">
                    <div class="date-time">
                        <div class="date-color-indicator" style="background-color: ${itemColor};"></div>
                        <span class="date" style="color: ${itemColor};">${formatDate(item.Date)}</span>
                        <span class="day">${item.Day}</span>
                        <span class="time">${item['Time Range']}</span>
                    </div>
                    <h3>${item.Location}</h3>
                </div>
                <div class="itinerary-content">
                    <h4>${item.Activity}</h4>
                    <p>${item.Notes}</p>
                    ${item['Google Maps URL'] ? 
                        `<a href="${item['Google Maps URL']}" target="_blank" class="maps-link" onclick="event.stopPropagation();">📍 Open in Google Maps</a>` 
                        : ''}
                </div>
            </div>
        `;
    });
    
    itineraryContainer.innerHTML = itineraryHTML;
}

// Initialize filter functionality
function initializeFilters() {
    const searchInput = document.getElementById('search');
    const regionFilter = document.getElementById('filter-region');
    const dateFilter = document.getElementById('filter-date');
    
    searchInput.addEventListener('input', () => {
        currentFilter.search = searchInput.value.toLowerCase();
        applyFilters();
    });
    
    regionFilter.addEventListener('change', () => {
        currentFilter.region = regionFilter.value;
        applyFilters();
    });
    
    dateFilter.addEventListener('change', () => {
        currentFilter.date = dateFilter.value;
        applyFilters();
    });
}

// Populate date filter dropdown
function populateDateFilter() {
    const dateFilter = document.getElementById('filter-date');
    const uniqueDates = [...new Set(itineraryData.map(item => item.Date))].sort();
    
    uniqueDates.forEach(date => {
        const option = document.createElement('option');
        option.value = date;
        option.textContent = formatDate(date);
        dateFilter.appendChild(option);
    });
}

// Apply current filters
function applyFilters() {
    const filteredData = itineraryData.filter(item => {
        // Search filter
        if (currentFilter.search) {
            const searchLower = currentFilter.search.toLowerCase();
            const searchable = `${item.Location} ${item.Activity} ${item.Notes}`.toLowerCase();
            if (!searchable.includes(searchLower)) {
                return false;
            }
        }
        
        // Region filter
        if (currentFilter.region) {
            const itemRegion = getRegion(item.Location);
            if (itemRegion !== currentFilter.region) {
                return false;
            }
        }
        
        // Date filter
        if (currentFilter.date) {
            if (item.Date !== currentFilter.date) {
                return false;
            }
        }
        
        return true;
    });
    
    // Update displays with filtered data
    updateDisplaysWithFilteredData(filteredData);
}

// Update all displays with filtered data
function updateDisplaysWithFilteredData(filteredData) {
    // Clear existing markers and routes
    markers.forEach(marker => map.removeLayer(marker));
    routes.forEach(route => map.removeLayer(route));
    markers = [];
    routes = [];
    markerToItemMap.clear();
    itemToMarkerMap.clear();
    
    // Create new markers with filtered data
    createMarkersFromData(filteredData);
    createRoutesFromData(filteredData);
    
    // Update timeline and itinerary
    renderTimelineWithData(filteredData);
    renderItineraryWithData(filteredData);
}

// Create markers from specific data
function createMarkersFromData(data) {
    const locationGroups = {};
    
    data.forEach((item, originalIndex) => {
        // Find the original index in the full itineraryData
        const fullIndex = itineraryData.indexOf(item);
        
        if (item.Coordinates) {
            const coords = item.Coordinates.split(',');
            if (coords.length === 2) {
                const lat = parseFloat(coords[0].trim());
                const lng = parseFloat(coords[1].trim());
                
                if (!isNaN(lat) && !isNaN(lng)) {
                    const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
                    
                    if (!locationGroups[key]) {
                        locationGroups[key] = {
                            lat: lat,
                            lng: lng,
                            activities: []
                        };
                    }
                    
                    locationGroups[key].activities.push({
                        ...item,
                        index: fullIndex
                    });
                }
            }
        }
    });

    // Create markers for each location group
    Object.values(locationGroups).forEach(group => {
        const firstActivity = group.activities[0];
        const markerColor = getColorForDate(firstActivity.Date);
        const coloredIcon = createColoredMarkerIcon(markerColor);
        
        const marker = L.marker([group.lat, group.lng], { icon: coloredIcon })
            .addTo(map)
            .on('click', () => {
                showLocationDetails(group.activities);
                highlightItineraryItems(group.activities);
            });
        
        markers.push(marker);
        
        // Store mapping between markers and items
        markerToItemMap.set(marker, group.activities);
        group.activities.forEach(activity => {
            itemToMarkerMap.set(activity.index, marker);
        });
    });
    
    // Fit map to show all markers
    if (markers.length > 0) {
        const group = new L.featureGroup(markers);
        map.fitBounds(group.getBounds().pad(0.1));
    }
}

// Create routes from specific data (for filtering)
async function createRoutesFromData(data) {
    for (let i = 0; i < data.length; i++) {
        const currentItem = data[i];
        
        if (isDrivingActivity(currentItem)) {
            const routeCoords = extractRouteCoordinatesFromData(currentItem, data);
            
            if (routeCoords.length >= 2) {
                const routeColor = getColorForDate(currentItem.Date);
                
                try {
                    // Fetch actual route from Mapbox
                    const routeData = await fetchMapboxRoute(routeCoords, routeColor, currentItem);
                    if (routeData) {
                        routes.push(routeData);
                    }
                } catch (error) {
                    console.error('Error fetching filtered route:', error);
                    // Fallback to straight line if API fails
                    createFallbackRoute(routeCoords, routeColor, currentItem);
                }
            }
        }
    }
}

// Extract route coordinates from filtered data
function extractRouteCoordinatesFromData(driveItem, data) {
    const coords = [];
    
    if (driveItem.Coordinates) {
        const driveCoords = driveItem.Coordinates.split(',');
        if (driveCoords.length === 2) {
            const lat = parseFloat(driveCoords[0].trim());
            const lng = parseFloat(driveCoords[1].trim());
            if (!isNaN(lat) && !isNaN(lng)) {
                coords.push([lat, lng]);
            }
        }
    }
    
    const currentIndex = data.indexOf(driveItem);
    for (let i = currentIndex - 1; i >= 0; i--) {
        const prevItem = data[i];
        if (!isDrivingActivity(prevItem) && prevItem.Coordinates) {
            const prevCoords = prevItem.Coordinates.split(',');
            if (prevCoords.length === 2) {
                const lat = parseFloat(prevCoords[0].trim());
                const lng = parseFloat(prevCoords[1].trim());
                if (!isNaN(lat) && !isNaN(lng)) {
                    coords.unshift([lat, lng]);
                    break;
                }
            }
        }
    }
    
    if (coords.length < 2) {
        for (let i = currentIndex + 1; i < data.length; i++) {
            const nextItem = data[i];
            if (!isDrivingActivity(nextItem) && nextItem.Coordinates) {
                const nextCoords = nextItem.Coordinates.split(',');
                if (nextCoords.length === 2) {
                    const lat = parseFloat(nextCoords[0].trim());
                    const lng = parseFloat(nextCoords[1].trim());
                    if (!isNaN(lat) && !isNaN(lng)) {
                        coords.push([lat, lng]);
                        break;
                    }
                }
            }
        }
    }
    
    return coords;
}

// Utility function to format dates
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric' 
    });
}

// Focus on map location when itinerary item is clicked
function focusOnMapLocation(itemIndex, switchToMapTab = true) {
    const item = itineraryData[itemIndex];
    const marker = itemToMarkerMap.get(itemIndex);
    
    if (!item.Coordinates) return;
    
    // Switch to map tab if requested (from itinerary view)
    if (switchToMapTab) {
        const mapTab = document.querySelector('[data-tab="map"]');
        if (mapTab && !mapTab.classList.contains('active')) {
            mapTab.click();
            // Wait for tab switch, then focus on location
            setTimeout(() => focusOnLocation(), 200);
            return;
        }
    }
    
    focusOnLocation();
    
    function focusOnLocation() {
        const coords = item.Coordinates.split(',');
        if (coords.length === 2) {
            const lat = parseFloat(coords[0].trim());
            const lng = parseFloat(coords[1].trim());
            
            if (!isNaN(lat) && !isNaN(lng)) {
                // Zoom to location
                map.setView([lat, lng], 14, {
                    animate: true,
                    duration: 1
                });
                
                // Trigger marker click to show details and highlight items
                if (marker) {
                    setTimeout(() => {
                        marker.fire('click');
                    }, 500);
                }
            }
        }
    }
}

// Highlight itinerary items when map marker is clicked
function highlightItineraryItems(activities) {
    // Remove existing highlights
    document.querySelectorAll('.itinerary-item.highlighted, .timeline-activity.highlighted')
        .forEach(item => item.classList.remove('highlighted'));
    
    // Highlight corresponding itinerary items
    activities.forEach(activity => {
        const itineraryItem = document.querySelector(`.itinerary-item[data-index="${activity.index}"]`);
        if (itineraryItem) {
            itineraryItem.classList.add('highlighted');
            
            // Scroll to first highlighted item if in itinerary tab
            if (activities.indexOf(activity) === 0) {
                const itineraryTab = document.getElementById('itinerary-tab');
                if (itineraryTab && itineraryTab.classList.contains('active')) {
                    setTimeout(() => {
                        itineraryItem.scrollIntoView({
                            behavior: 'smooth',
                            block: 'center'
                        });
                    }, 100);
                }
            }
        }
        
        // Also highlight timeline items
        const timelineItems = document.querySelectorAll('.timeline-activity');
        timelineItems.forEach((timelineItem, index) => {
            // Find matching timeline item (this is a simple approach)
            const timelineLocation = timelineItem.querySelector('h4')?.textContent;
            if (timelineLocation === activity.Location) {
                timelineItem.classList.add('highlighted');
            }
        });
    });
}

// Clear all filters and reset to show all data
function clearFilters() {
    currentFilter = { region: '', date: '', search: '' };
    
    // Reset form controls
    document.getElementById('search').value = '';
    document.getElementById('filter-region').value = '';
    document.getElementById('filter-date').value = '';
    
    // Reset displays to show all data
    updateDisplaysWithFilteredData(itineraryData);
}

// Add clear filters button functionality
function addClearFiltersButton() {
    const controlsDiv = document.querySelector('.controls');
    const clearButton = document.createElement('button');
    clearButton.textContent = 'Clear Filters';
    clearButton.className = 'clear-filters-btn';
    clearButton.onclick = clearFilters;
    controlsDiv.appendChild(clearButton);
}

// Mobile optimizations
function initializeMobileOptimizations() {
    // Prevent double-tap zoom on buttons and interactive elements
    const interactiveElements = document.querySelectorAll('.tab-button, .itinerary-item, .timeline-activity, .clear-filters-btn');
    interactiveElements.forEach(element => {
        element.style.touchAction = 'manipulation';
    });
    
    // Improve map touch handling on mobile
    if (map) {
        // Disable map zoom on double tap for better mobile experience
        map.doubleClickZoom.disable();
        
        // Add touch-friendly map controls
        if (window.innerWidth <= 768) {
            map.touchZoom.enable();
            map.dragging.enable();
        }
    }
    
    // Add swipe detection for tabs on mobile
    if (window.innerWidth <= 768) {
        addSwipeNavigation();
    }
    
    // Handle orientation changes
    window.addEventListener('orientationchange', function() {
        setTimeout(() => {
            if (map) {
                map.invalidateSize();
            }
        }, 100);
    });
    
    // Improve scroll behavior on iOS
    const scrollableElements = document.querySelectorAll('.timeline-container, .itinerary-container, .map-info');
    scrollableElements.forEach(element => {
        element.style.webkitOverflowScrolling = 'touch';
    });
}

// Add swipe navigation for tabs on mobile
function addSwipeNavigation() {
    let startX = 0;
    let currentTab = 0;
    const tabs = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    
    function getCurrentActiveTabIndex() {
        return Array.from(tabs).findIndex(tab => tab.classList.contains('active'));
    }
    
    function switchToTab(index) {
        if (index >= 0 && index < tabs.length) {
            tabs[getCurrentActiveTabIndex()].classList.remove('active');
            tabContents[getCurrentActiveTabIndex()].classList.remove('active');
            
            tabs[index].classList.add('active');
            tabContents[index].classList.add('active');
            
            // Trigger map resize if switching to map tab
            if (index === 0 && map) {
                setTimeout(() => map.invalidateSize(), 100);
            }
        }
    }
    
    // Add touch events to main container
    const container = document.querySelector('main');
    
    container.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        currentTab = getCurrentActiveTabIndex();
    }, { passive: true });
    
    container.addEventListener('touchend', (e) => {
        const endX = e.changedTouches[0].clientX;
        const diffX = startX - endX;
        
        // Minimum swipe distance
        if (Math.abs(diffX) > 50) {
            if (diffX > 0 && currentTab < tabs.length - 1) {
                // Swipe left - next tab
                switchToTab(currentTab + 1);
            } else if (diffX < 0 && currentTab > 0) {
                // Swipe right - previous tab
                switchToTab(currentTab - 1);
            }
        }
    }, { passive: true });
}

// Utility function to determine region from location
function getRegion(location) {
    const locationLower = location.toLowerCase();
    if (locationLower.includes('morcote') || locationLower.includes('lugano')) {
        return 'morcote';
    } else if (locationLower.includes('pallanza') || locationLower.includes('maggiore')) {
        return 'pallanza';
    } else if (locationLower.includes('sale marasino') || locationLower.includes('iseo')) {
        return 'sale-marasino';
    } else if (locationLower.includes('selva') || locationLower.includes('cortina') || locationLower.includes('dolomites')) {
        return 'dolomites';
    }
    return 'other';
}

// Notes functionality
function initializeNotesDrawer() {
    const drawer = document.getElementById('notes-drawer');
    const overlay = document.getElementById('drawer-overlay');
    const closeBtn = document.getElementById('close-notes-drawer');
    const saveBtn = document.getElementById('save-notes-btn');
    const clearBtn = document.getElementById('clear-notes-btn');
    const addUrlBtn = document.getElementById('add-url-btn');

    // Close drawer events
    closeBtn.addEventListener('click', closeNotesDrawer);
    overlay.addEventListener('click', closeNotesDrawer);

    // Save notes
    saveBtn.addEventListener('click', saveCurrentNotes);

    // Clear notes
    clearBtn.addEventListener('click', clearCurrentNotes);

    // Add URL
    addUrlBtn.addEventListener('click', addNewUrl);

    // Allow Enter key to save or add URL
    document.getElementById('location-notes').addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'Enter') {
            saveCurrentNotes();
        }
    });

    document.getElementById('new-url').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            addNewUrl();
            e.preventDefault();
        }
    });
}

function openNotesDrawer(location, activity, index) {
    currentNotesLocation = { location, activity, index };
    
    // Update drawer title
    document.getElementById('notes-drawer-title').textContent = `Notes: ${location}`;
    
    // Load existing notes for this location
    loadNotesForLocation(location);
    
    // Show drawer
    document.getElementById('notes-drawer').classList.add('open');
    document.getElementById('drawer-overlay').classList.add('active');
    
    // Focus on notes textarea
    setTimeout(() => {
        document.getElementById('location-notes').focus();
    }, 300);
}

function closeNotesDrawer() {
    document.getElementById('notes-drawer').classList.remove('open');
    document.getElementById('drawer-overlay').classList.remove('active');
    currentNotesLocation = null;
}

function loadNotesForLocation(location) {
    const locationNotes = notesData[location] || { notes: '', urls: [] };
    
    // Load notes text
    document.getElementById('location-notes').value = locationNotes.notes || '';
    
    // Load URLs
    renderUrlList(locationNotes.urls || []);
}

function renderUrlList(urls) {
    const urlList = document.getElementById('url-list');
    urlList.innerHTML = '';
    
    urls.forEach((urlData, index) => {
        const urlItem = document.createElement('div');
        urlItem.className = 'url-item';
        urlItem.innerHTML = `
            <a href="${urlData.url}" target="_blank" rel="noopener noreferrer">${urlData.title}</a>
            <button class="delete-url-btn" onclick="deleteUrl(${index})">Delete</button>
        `;
        urlList.appendChild(urlItem);
    });
}

function addNewUrl() {
    const titleInput = document.getElementById('new-url-title');
    const urlInput = document.getElementById('new-url');
    
    const title = titleInput.value.trim();
    const url = urlInput.value.trim();
    
    if (!title || !url) {
        alert('Please enter both title and URL');
        return;
    }
    
    if (!isValidUrl(url)) {
        alert('Please enter a valid URL');
        return;
    }
    
    if (!currentNotesLocation) return;
    
    const location = currentNotesLocation.location;
    if (!notesData[location]) {
        notesData[location] = { notes: '', urls: [] };
    }
    
    notesData[location].urls.push({ title, url });
    renderUrlList(notesData[location].urls);
    
    // Clear inputs
    titleInput.value = '';
    urlInput.value = '';
    
    // Save automatically
    saveNotesData();
}

function deleteUrl(index) {
    if (!currentNotesLocation) return;
    
    const location = currentNotesLocation.location;
    if (!notesData[location]) return;
    
    notesData[location].urls.splice(index, 1);
    renderUrlList(notesData[location].urls);
    
    // Save automatically
    saveNotesData();
}

function saveCurrentNotes() {
    if (!currentNotesLocation) return;
    
    const location = currentNotesLocation.location;
    const notes = document.getElementById('location-notes').value.trim();
    
    if (!notesData[location]) {
        notesData[location] = { notes: '', urls: [] };
    }
    
    notesData[location].notes = notes;
    
    // Save to localStorage
    saveNotesData();
    
    // Update UI to show notes indicator
    updateNotesIndicators();
    
    // Show success feedback
    const saveBtn = document.getElementById('save-notes-btn');
    const originalText = saveBtn.textContent;
    saveBtn.textContent = 'Saved!';
    saveBtn.style.background = '#20c997';
    
    setTimeout(() => {
        saveBtn.textContent = originalText;
        saveBtn.style.background = '#28a745';
    }, 1500);
}

function clearCurrentNotes() {
    if (!currentNotesLocation) return;
    
    if (!confirm('Are you sure you want to clear all notes and URLs for this location?')) {
        return;
    }
    
    const location = currentNotesLocation.location;
    delete notesData[location];
    
    // Clear UI
    document.getElementById('location-notes').value = '';
    renderUrlList([]);
    
    // Save to localStorage
    saveNotesData();
    
    // Update UI indicators
    updateNotesIndicators();
}

function saveNotesData() {
    try {
        localStorage.setItem('italy-trip-notes', JSON.stringify(notesData));
    } catch (error) {
        console.error('Failed to save notes:', error);
        alert('Failed to save notes. Please try again.');
    }
}

function loadNotesData() {
    try {
        const saved = localStorage.getItem('italy-trip-notes');
        if (saved) {
            notesData = JSON.parse(saved);
        }
    } catch (error) {
        console.error('Failed to load notes:', error);
        notesData = {};
    }
}

function hasNotes(activity) {
    const location = activity.Location;
    const locationNotes = notesData[location];
    return locationNotes && (locationNotes.notes || (locationNotes.urls && locationNotes.urls.length > 0));
}

function updateNotesIndicators() {
    // Update timeline indicators
    setTimeout(() => {
        renderTimeline();
        renderItinerary();
    }, 100);
}

function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}

// Mapbox routing functions
async function fetchMapboxRoute(coordinates, color, driveItem) {
    if (coordinates.length < 2) return null;
    
    // Convert [lat, lng] to [lng, lat] for Mapbox API
    const waypoints = coordinates.map(coord => `${coord[1]},${coord[0]}`).join(';');
    
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${waypoints}?steps=true&geometries=geojson&access_token=${MAPBOX_TOKEN}`;
    
    try {
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.routes && data.routes.length > 0) {
            const route = data.routes[0];
            const geometry = route.geometry;
            
            // Convert GeoJSON coordinates to Leaflet format [lat, lng]
            const leafletCoords = geometry.coordinates.map(coord => [coord[1], coord[0]]);
            
            // Create polyline with actual route geometry
            const polyline = L.polyline(leafletCoords, {
                color: color,
                weight: 4,
                opacity: 0.8,
                smoothFactor: 1.0
            }).addTo(map);
            
            // Enhanced popup with route details
            const distance = (route.distance / 1000).toFixed(1); // Convert to km
            const duration = Math.round(route.duration / 60); // Convert to minutes
            const hours = Math.floor(duration / 60);
            const minutes = duration % 60;
            const durationText = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
            
            polyline.bindPopup(`
                <div class="route-popup">
                    <h4>🚗 ${driveItem.Activity}</h4>
                    <p><strong>Date:</strong> ${formatDate(driveItem.Date)}</p>
                    <p><strong>Time:</strong> ${driveItem['Time Range']}</p>
                    <p><strong>Distance:</strong> ${distance} km</p>
                    <p><strong>Estimated Time:</strong> ${durationText}</p>
                    <p><strong>Notes:</strong> ${driveItem.Notes}</p>
                </div>
            `);
            
            return polyline;
        }
    } catch (error) {
        console.error('Mapbox API error:', error);
        throw error;
    }
    
    return null;
}

function createFallbackRoute(coordinates, color, driveItem) {
    // Fallback to straight line if Mapbox API fails
    const route = L.polyline(coordinates, {
        color: color,
        weight: 4,
        opacity: 0.7,
        dashArray: '10, 10'
    }).addTo(map);
    
    route.bindPopup(`
        <div class="route-popup">
            <h4>🚗 ${driveItem.Activity}</h4>
            <p><strong>Date:</strong> ${formatDate(driveItem.Date)}</p>
            <p><strong>Time:</strong> ${driveItem['Time Range']}</p>
            <p><strong>Notes:</strong> ${driveItem.Notes}</p>
            <p><em>Route approximated (API unavailable)</em></p>
        </div>
    `);
    
    routes.push(route);
}