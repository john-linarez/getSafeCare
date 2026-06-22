// Date: June 19th 2026
// Author: John Linarez Cerezo
// Description: This file is intended to access the database and render the clinics information / map used on the site.
// It also allows filtering and recording user queries whenever they lookup a clinic.

// supabase information
const SUPABASE_URL = 'https://vqkyqybqpxqokpwkycwn.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZxa3lxeWJxcHhxb2twd2t5Y3duIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2NzQyNjgsImV4cCI6MjA4ODI1MDI2OH0.9NJEuAsUwTzZTemP9ZRJEpPQ1K8IE5IiMPaa7bAEGNA'; 
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// clinic dynamic rendering
let allClinics = []; 
let map; 
let markersLayer = L.layerGroup(); 
let clinicMarkers = {}; 

// translation for supported languages (to include more languages in the future)
function googleTranslateElementInit() {
    new google.translate.TranslateElement({
        pageLanguage: 'en',
        layout: google.translate.TranslateElement.InlineLayout.SIMPLE,
        includedLanguages: 'en,es'
    }, 'google_translate_element');
}

// creates the map (the default is set to the Boston area clinics)
function initializeMap() {
    const bostonCoords = [42.3601, -71.0589]; 
    map = L.map('map').setView(bostonCoords, 12); 

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap contributors, © CARTO'
    }).addTo(map);

    markersLayer.addTo(map);
    setTimeout(() => map.invalidateSize(), 100);

    // ADD THIS: Fixes map disappearing when resizing the window/rotating phone
    window.addEventListener('resize', () => {
        setTimeout(() => map.invalidateSize(), 200);
    });
}

// display clinic information as needed based on filtering and or fetching database information
async function fetchAndSetupClinics() {
    try {
        const { data, error } = await supabaseClient.from('clinics').select('*');
        if (error) throw error;
        
        allClinics = data;
        initializeMap(); 
        renderAllClinicsToDOM(allClinics); 
        setTimeout(() => {
            map.invalidateSize();
            
            if (Object.keys(clinicMarkers).length > 0) {
                const group = new L.featureGroup(Object.values(clinicMarkers));
                map.fitBounds(group.getBounds(), {padding: [30, 30]});
            }
        }, 500);
    } catch (error) {
        console.error("Could not fetch clinic data:", error);
        document.getElementById('clinic-data').innerHTML = '<p class="error-message">Error loading clinic data. Please check connection.</p>';
    }
}

// tracks the user's search words and filtering as applicable for engagement records
async function trackEngagement(clinicId, eventType) {
    if (!clinicId || clinicId === 'undefined') return; 

    const searchTerm = document.getElementById('city-search').value.trim();
    const wantsNoInsurance = document.getElementById('no-insurance').checked;
    const wantsSpanish = document.getElementById('spanish-staff').checked;
    const selectedInsurance = document.getElementById('insurance-select').value;

    let appliedFilters = [];
    if (wantsNoInsurance) appliedFilters.push("No Insurance");
    if (wantsSpanish) appliedFilters.push("Spanish Staff");
    if (selectedInsurance) appliedFilters.push(`Ins: ${selectedInsurance}`);

    const filterText = appliedFilters.length > 0 ? appliedFilters.join(", ") : "None";

    try {
        const { error } = await supabaseClient.from('engagementstable').insert([
            { 
                clinic_id: clinicId, 
                event_type: eventType,
                search_term: searchTerm || null,     // Saves what they typed
                filters_applied: filterText          // Saves the checkboxes/dropdowns
            }
        ]);
        
        if (error) throw error;
        console.log(`Successfully Tracked: ${eventType} | Search: "${searchTerm}" | Filters: [${filterText}]`);
    } catch (error) {
        console.error("Failed to track engagement:", error.message || error);
    }
}

// when loading, this is suppose to only run once to trigger new HTML sections for filtering 
// of other languages
function renderAllClinicsToDOM(clinics) {
    const container = document.getElementById('clinic-data');
    document.getElementById('clinic-count').textContent = `(${clinics.length} results)`;
    
    let html = '';
    clinics.forEach(clinic => {
        const uninsured = clinic.allows_uninsured_appointments;
        const uninsuredBool = (uninsured === 'Yes' || uninsured === true);
        const insurances = (clinic.other_insurances_accepted || "").toLowerCase();
        const hasSpanish = (clinic.languages || "").toLowerCase().includes('spanish');

        html += `
            <div class="clinic-card" 
                 id="card-${clinic.id}"
                 data-uninsured="${uninsuredBool}"
                 data-spanish="${hasSpanish}"
                 data-insurance="${insurances}">
                 
                <h3>${clinic.clinic_name}</h3>
                <p class="address-text">📍 ${clinic.address} (${clinic.city})</p>
                <div class="clinic-details">
                    <p>📞 <strong>Phone:</strong> <a href="tel:${clinic.phone_number}" onclick="trackEngagement('${clinic.id}', 'clicked_phone')">${clinic.phone_number}</a></p>
                    <p>🌐 <strong>Website:</strong> <a href="${clinic.website}" target="_blank" onclick="trackEngagement('${clinic.id}', 'clicked_website')">View Website</a></p>
                    <p>💬 <strong>Languages:</strong> ${clinic.languages}</p>
                    <p>💰 <strong>Cost:</strong> <span class="badge ${uninsuredBool ? 'badge-green' : 'badge-yellow'}">${clinic.cost_type}</span></p>
                    <p>🕒 <strong>Hours:</strong> ${clinic.hours || 'Varies'} (${clinic.days_open || ''})</p>
                    <p class="verification-note">✅ Verified: ${clinic.last_verified || 'Unknown'}</p>
                </div>
            </div>
        `;

        if (clinic.latitude && clinic.longitude) {
            const marker = L.marker([clinic.latitude, clinic.longitude]).bindPopup(`
                <strong>${clinic.clinic_name}</strong><br>${clinic.address}<br>
                <a href="${clinic.website}" target="_blank" onclick="trackEngagement('${clinic.id}', 'clicked_map_website')">Website</a>
            `);
            clinicMarkers[clinic.id] = marker;
            markersLayer.addLayer(marker); 
        }
    });

    container.innerHTML = html;
}

// this will be expanded later for more than spanish (for now only spanish is supported for direct translations)
function filterClinics() {
    const searchInput = document.getElementById('city-search').value.toLowerCase().trim();
    const filterNoInsurance = document.getElementById('no-insurance').checked;
    const filterSpanish = document.getElementById('spanish-staff').checked;
    const selectedInsurance = document.getElementById('insurance-select').value.toLowerCase(); 

    const cards = document.querySelectorAll('.clinic-card');
    let visibleCount = 0;

    cards.forEach(card => {
        const cardText = card.innerText.toLowerCase();
        const matchesSearch = cardText.includes(searchInput);
        
        const isUninsured = card.getAttribute('data-uninsured') === 'true';
        const matchesInsuranceStatus = filterNoInsurance ? isUninsured : true;

        const hasSpanish = card.getAttribute('data-spanish') === 'true';
        const matchesSpanish = filterSpanish ? hasSpanish : true;

        const cardInsurances = card.getAttribute('data-insurance');
        const matchesProvider = selectedInsurance ? cardInsurances.includes(selectedInsurance) : true;

        const isVisible = matchesSearch && matchesInsuranceStatus && matchesSpanish && matchesProvider;
        const clinicId = card.id.replace('card-', '');

        if (isVisible) {
            card.style.display = 'block';
            visibleCount++;
            if (clinicMarkers[clinicId] && !markersLayer.hasLayer(clinicMarkers[clinicId])) {
                markersLayer.addLayer(clinicMarkers[clinicId]);
            }
        } else {
            card.style.display = 'none';
            if (clinicMarkers[clinicId] && markersLayer.hasLayer(clinicMarkers[clinicId])) {
                markersLayer.removeLayer(clinicMarkers[clinicId]);
            }
        }
    });

    document.getElementById('clinic-count').textContent = `(${visibleCount} results)`;
}

fetchAndSetupClinics();
