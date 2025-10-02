'use client';

import { useEffect, useRef, useState, use } from 'react';
import { notFound, useRouter } from 'next/navigation';
import maplibregl from 'maplibre-gl';
import { PMTiles, Protocol } from 'pmtiles';
import 'maplibre-gl/dist/maplibre-gl.css';
import './popup-styles.css';
import { getOrchardById, getAllOrchards, OrchardConfig } from '../../../lib/orchards';
import { validatePMTiles } from '../../../lib/pmtiles-utils';

// Type definitions for tree data
interface TreeProperties {
  tree_id?: string;
  name?: string;
  variety?: string;
  health?: string;
  status?: string;
  planted_date?: string;
  row_id?: string;
  block_id?: string;
  [key: string]: any;
}

interface TreeDetails extends TreeProperties {
  // Extended properties that would come from API
  age?: number;
  height?: number;
  canopy_width?: number;
  last_pruned?: string;
  last_harvest?: string;
  yield_estimate?: number;
  notes?: string;
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function OrchardPage({ params: paramsPromise }: PageProps) {
  const router = useRouter();

  // Unwrap the params promise in Next.js 15
  const params = use(paramsPromise);
  const orchardId = params.id;

  const orchard = orchardId ? getOrchardById(orchardId) : null;
  const allOrchards = getAllOrchards();

  // Initialize hooks first (before any early returns)
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const isInitializing = useRef(false); // Track initialization state
  const [selectedTreeId, setSelectedTreeId] = useState<string | null>(null);
  const [selectedTreeFeature, setSelectedTreeFeature] = useState<any>(null);
  const [showOrchardSelector, setShowOrchardSelector] = useState(false);
  const [pmtilesEnabled, setPmtilesEnabled] = useState(false);

  // Handle invalid orchard ID or loading state
  if (!orchardId) {
    return <div className="h-screen w-screen flex items-center justify-center">Loading...</div>;
  }

  if (!orchard) {
    notFound();
  }

  // Function to fetch tree details from API (prepared for future implementation)
  const fetchTreeDetails = async (treeId: string): Promise<TreeDetails | null> => {
    // Placeholder for API integration
    try {
      // Uncomment when API endpoint is ready:
      // const response = await fetch(`/api/trees/${treeId}`);
      // if (!response.ok) throw new Error('Failed to fetch tree details');
      // return await response.json();

      // For now, simulate API call with timeout
      await new Promise(resolve => setTimeout(resolve, 500));

      // Return mock enhanced data for demo
      return {
        tree_id: treeId,
        variety: 'Demo Variety',
        health: 'healthy',
        status: 'healthy',
        age: 5,
        height: 3.5,
        last_pruned: '2024-03-15',
        last_harvest: '2024-09-01',
        yield_estimate: 150
      };
    } catch (error) {
      console.error('Error fetching tree details:', error);
      return null;
    }
  };

  // Function to create popup content with Tailwind styling
  const createPopupContent = (
    properties: TreeProperties,
    details?: TreeDetails | null,
    isLoading?: boolean,
    isEditing: boolean = false
  ) => {
    const data = details || properties;

    // Create a container div
    const container = document.createElement('div');
    container.className = 'p-4 max-w-xs';

    // Title section
    const title = document.createElement('h3');
    title.className = 'text-lg font-semibold text-gray-900 mb-2 border-b border-gray-200 pb-2';
    title.textContent = data.name || (data.tree_id ? `Tree ${data.tree_id}` : 'Tree Details');
    container.appendChild(title);

    // Details grid
    const detailsGrid = document.createElement('div');
    detailsGrid.className = 'space-y-2';

    // Helper function to create detail rows (editable or display)
    const addDetailRow = (label: string, key: string, value: string | undefined, colorClass?: string, editable: boolean = false) => {
      if (!value && !isEditing) return;

      const row = document.createElement('div');
      row.className = 'flex justify-between items-center gap-2';

      const labelSpan = document.createElement('span');
      labelSpan.className = 'text-sm font-medium text-gray-600';
      labelSpan.textContent = label;

      if (isEditing && editable) {
        const input = document.createElement('input');
        input.type = 'text';
        input.value = value || '';
        input.dataset.key = key;
        input.className = 'text-sm px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 flex-1 max-w-[150px]';

        row.appendChild(labelSpan);
        row.appendChild(input);
      } else {
        const valueSpan = document.createElement('span');
        valueSpan.className = `text-sm font-medium ${colorClass || 'text-gray-900'}`;
        valueSpan.textContent = value || '-';

        row.appendChild(labelSpan);
        row.appendChild(valueSpan);
      }

      detailsGrid.appendChild(row);
    };

    // Show all available properties from PMTiles
    // Basic identification
    addDetailRow('ID:', 'tree_id', data.tree_id, undefined, false); // ID is not editable
    addDetailRow('Name:', 'name', data.name, undefined, true);
    addDetailRow('Variety:', 'variety', data.variety, undefined, true);

    // Status/health with color coding
    const status = data.status || data.health;
    if (status || isEditing) {
      let colorClass = 'text-gray-900';
      if (status === 'healthy') colorClass = 'text-green-600';
      else if (status === 'stressed') colorClass = 'text-yellow-600';
      else if (status === 'dead') colorClass = 'text-red-600';

      if (isEditing) {
        // Create status dropdown for editing
        const row = document.createElement('div');
        row.className = 'flex justify-between items-center gap-2';

        const labelSpan = document.createElement('span');
        labelSpan.className = 'text-sm font-medium text-gray-600';
        labelSpan.textContent = 'Status:';

        const select = document.createElement('select');
        select.dataset.key = 'status';
        select.className = 'text-sm px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 flex-1 max-w-[150px]';

        const options = ['healthy', 'stressed', 'dead', 'unknown'];
        options.forEach(opt => {
          const option = document.createElement('option');
          option.value = opt;
          option.textContent = opt.charAt(0).toUpperCase() + opt.slice(1);
          if (opt === status) option.selected = true;
          select.appendChild(option);
        });

        row.appendChild(labelSpan);
        row.appendChild(select);
        detailsGrid.appendChild(row);
      } else {
        addDetailRow('Status:', 'status', status ? status.charAt(0).toUpperCase() + status.slice(1) : undefined, colorClass);
      }
    }

    // Dates
    addDetailRow('Planted:', 'planted_date', data.planted_date, undefined, true);

    // Location info
    addDetailRow('Block:', 'block_id', data.block_id, undefined, true);
    addDetailRow('Row:', 'row_id', data.row_id, undefined, true);

    // Display any other properties from PMTiles
    Object.keys(data).forEach(key => {
      // Skip already displayed properties
      if (!['tree_id', 'name', 'variety', 'status', 'health', 'planted_date', 'block_id', 'row_id'].includes(key)) {
        const value = data[key];
        if (value !== null && value !== undefined && typeof value !== 'object') {
          addDetailRow(key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) + ':', key, String(value), undefined, true);
        }
      }
    });

    // Add extended details if available (from API)
    if (details && !isEditing) {
      if (details.age) {
        addDetailRow('Age:', 'age', `${details.age} years`);
      }
      if (details.height) {
        addDetailRow('Height:', 'height', `${details.height} m`);
      }
      if (details.last_harvest) {
        addDetailRow('Last Harvest:', 'last_harvest', details.last_harvest);
      }
      if (details.yield_estimate) {
        addDetailRow('Est. Yield:', 'yield_estimate', `${details.yield_estimate} kg`);
      }
    }

    container.appendChild(detailsGrid);

    // Add loading indicator if fetching data
    if (isLoading) {
      const loadingDiv = document.createElement('div');
      loadingDiv.className = 'mt-3 pt-3 border-t border-gray-200 flex items-center justify-center';

      const spinner = document.createElement('div');
      spinner.className = 'animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600';

      const loadingText = document.createElement('span');
      loadingText.className = 'ml-2 text-sm text-gray-600';
      loadingText.textContent = 'Loading details...';

      loadingDiv.appendChild(spinner);
      loadingDiv.appendChild(loadingText);
      container.appendChild(loadingDiv);

      return container;
    }

    // Add action buttons section
    const actions = document.createElement('div');
    actions.className = 'mt-3 pt-3 border-t border-gray-200 flex gap-2';

    if (isEditing) {
      // Save and Cancel buttons for edit mode
      const saveButton = document.createElement('button');
      saveButton.className = 'flex-1 px-3 py-1.5 text-xs font-medium text-white bg-green-600 rounded hover:bg-green-700 transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-1';
      saveButton.textContent = 'Save';
      saveButton.onclick = () => {
        // Collect edited values
        const editedData: any = { ...properties };

        // Get all input fields
        container.querySelectorAll('input[data-key], select[data-key]').forEach((elem: any) => {
          editedData[elem.dataset.key] = elem.value;
        });

        // TODO: Save to backend API
        // For now, just update the local display
        if (popupRef.current) {
          popupRef.current.setDOMContent(createPopupContent(editedData, details, false, false));
        }

        // Update the map feature properties (for visual feedback)
        if (map.current && selectedTreeFeature) {
          // Update the visual appearance based on new status
          const newStatus = editedData.status || editedData.health;
          if (newStatus) {
            // This would update the circle color based on new status
            // Note: This is a visual update only, actual data needs backend persistence
          }
        }
      };

      const cancelButton = document.createElement('button');
      cancelButton.className = 'flex-1 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-50 rounded hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-1';
      cancelButton.textContent = 'Cancel';
      cancelButton.onclick = () => {
        // Exit edit mode without saving
        if (popupRef.current) {
          popupRef.current.setDOMContent(createPopupContent(properties, details, false, false));
        }
      };

      actions.appendChild(saveButton);
      actions.appendChild(cancelButton);
    } else {
      // View Details and Edit buttons for display mode
      const viewButton = document.createElement('button');
      viewButton.className = 'flex-1 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded hover:bg-blue-100 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1';
      viewButton.textContent = details ? 'Refresh' : 'Load Details';
      viewButton.setAttribute('aria-label', `View details for tree ${data.tree_id}`);
      viewButton.onclick = async () => {
        // Show loading state
        if (data.tree_id && popupRef.current) {
          const loadingContent = createPopupContent(properties, null, true, false);
          popupRef.current.setDOMContent(loadingContent);

          // Fetch and update with full details
          const fullDetails = await fetchTreeDetails(data.tree_id);

          // Small delay to show loading state
          await new Promise(resolve => setTimeout(resolve, 300));

          if (popupRef.current) {
            const newContent = createPopupContent(properties, fullDetails || properties, false, false);
            popupRef.current.setDOMContent(newContent);
          }
        }
      };

      const editButton = document.createElement('button');
      editButton.className = 'flex-1 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-50 rounded hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-1';
      editButton.textContent = 'Edit';
      editButton.setAttribute('aria-label', `Edit tree ${data.tree_id}`);
      editButton.onclick = () => {
        // Enter edit mode
        if (popupRef.current) {
          popupRef.current.setDOMContent(createPopupContent(properties, details, false, true));
        }
      };

      actions.appendChild(viewButton);
      actions.appendChild(editButton);
    }

    container.appendChild(actions);

    return container;
  };

  useEffect(() => {
    // Prevent multiple initializations using ref flag
    if (isInitializing.current || map.current) return;
    if (!mapContainer.current || !orchard) return;

    // Set flag to prevent double initialization
    isInitializing.current = true;

    // Define keyboard handler outside initializeMap so we can clean it up
    const handleKeyPress = (e: KeyboardEvent) => {
      if (!map.current) return;

      // Skip if user is typing in an input
      if ((e.target as HTMLElement).tagName === 'INPUT' ||
          (e.target as HTMLElement).tagName === 'TEXTAREA') {
        return;
      }

      // Escape key to close popup
      if (e.key === 'Escape' && popupRef.current) {
        popupRef.current.remove();
        setSelectedTreeId(null);
        setSelectedTreeFeature(null);
        popupRef.current = null;
        // Clear selected tree label filter
        if (map.current) {
          map.current.setFilter('orchard-tree-labels-selected', ['==', ['get', 'tree_id'], '']);
        }
        return;
      }

      // Arrow keys for map panning (when no popup is open)
      if (!popupRef.current) {
        const panDistance = 100; // pixels to pan

        switch(e.key) {
          case 'ArrowUp':
            e.preventDefault();
            map.current.panBy([0, -panDistance]);
            break;
          case 'ArrowDown':
            e.preventDefault();
            map.current.panBy([0, panDistance]);
            break;
          case 'ArrowLeft':
            e.preventDefault();
            map.current.panBy([-panDistance, 0]);
            break;
          case 'ArrowRight':
            e.preventDefault();
            map.current.panBy([panDistance, 0]);
            break;
          case '+':
          case '=':
            e.preventDefault();
            map.current.zoomIn();
            break;
          case '-':
          case '_':
            e.preventDefault();
            map.current.zoomOut();
            break;
        }
      }
    };

    const initializeMap = async () => {
      // Clear any existing map content in the container
      if (mapContainer.current) {
        mapContainer.current.innerHTML = '';
      }
      // Register PMTiles protocol with error handling
      let protocol: Protocol | null = null;

      // Validate and load PMTiles if it exists
      let pmtilesValid = false;
      let sourceLayerName = 'default'; // Default layer name

      if (orchard.pmtilesPath) {
        const validation = await validatePMTiles(orchard.pmtilesPath);

        if (validation.valid) {
          pmtilesValid = true;
          setPmtilesEnabled(true);

          // Check available layers and use the first one or look for 'trees'
          if (validation.metadata?.vector_layers && validation.metadata.vector_layers.length > 0) {
            // Look for a 'trees' layer first, otherwise use the first available
            const treesLayer = validation.metadata.vector_layers.find((l: any) => l.id === 'trees');
            sourceLayerName = treesLayer ? 'trees' : validation.metadata.vector_layers[0].id || 'default';
          } else {
            sourceLayerName = 'default';
          }

          // Register protocol only if valid and not already registered
          try {
            // Remove any existing protocol first
            maplibregl.removeProtocol('pmtiles');
          } catch (e) {
            // Protocol doesn't exist, that's fine
          }
          protocol = new Protocol();
          maplibregl.addProtocol('pmtiles', protocol.tile);
        } else {
          pmtilesValid = false;
          setPmtilesEnabled(false);
        }
      }

    // Create map with orthomosaic tiles from PMTiles or public directory
    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        glyphs: 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf',
        layers: [],
        sources: {
          // Only add orthomosaic if we have a source
          ...(orchard.orthoPmtilesPath ? {
            'orchard-orthomosaic': {
              // Use PMTiles for orthomosaic if available
              type: 'raster',
              url: `pmtiles://${orchard.orthoPmtilesPath}`,
              attribution: `${orchard.name} Orthomosaic`,
              tileSize: 256,
              minzoom: orchard.tileMinZoom,
              maxzoom: orchard.tileMaxZoom
            }
          } : {}),
          // Only add vector source if PMTiles file exists and is valid
          ...(pmtilesValid && orchard.pmtilesPath ? {
            'orchard-vectors': {
              type: 'vector',
              url: `pmtiles://${orchard.pmtilesPath}`, // Dynamic PMTiles path
              attribution: `${orchard.name} Geometry Data`,
              minzoom: 0,   // Request tiles from zoom 0
              maxzoom: 22,  // Up to max zoom
              promoteId: 'tree_id' // Use tree_id as feature ID for better performance
            }
          } : {})
        }
      },
      center: orchard.center, // Dynamic orchard center
      zoom: orchard.defaultZoom, // Dynamic default zoom
      maxZoom: orchard.maxZoom, // Dynamic max zoom
      minZoom: orchard.minZoom, // Dynamic min zoom
      pitch: 0,
      bearing: 0
    });

    // Add layers after map is created
    map.current.on('load', () => {
      // Add orthomosaic layer if available
      if (orchard.orthoPmtilesPath && map.current) {
        map.current.addLayer({
          id: 'orchard-orthomosaic-layer',
          type: 'raster',
          source: 'orchard-orthomosaic',
          minzoom: 0,
          maxzoom: 22,
          paint: {
            'raster-opacity': 1,
            'raster-fade-duration': 100,
            'raster-resampling': 'linear'
          }
        });
      }

      // Add vector layers if PMTiles source exists and is valid
      if (pmtilesValid && orchard.pmtilesPath && map.current) {
        // Trees layer
        map.current.addLayer({
          id: 'orchard-trees',
          type: 'circle',
          source: 'orchard-vectors',
          'source-layer': sourceLayerName,
          paint: {
              'circle-radius': [
                'interpolate',
                ['linear'],
                ['zoom'],
                10, 1,    // Very small at zoom 10
                12, 2,    // Small dots at zoom 12
                15, 3,    // Medium at zoom 15
                18, 5,    // Larger at zoom 18
                20, 8     // Large at zoom 20
              ],
              'circle-color': [
                'case',
                // Check for status first, then health
                ['has', 'status'],
                [
                  'case',
                  ['==', ['get', 'status'], 'healthy'], '#2ecc71',
                  ['==', ['get', 'status'], 'stressed'], '#f39c12',
                  ['==', ['get', 'status'], 'dead'], '#e74c3c',
                  '#95a5a6' // default gray
                ],
                // Fallback to health property
                ['has', 'health'],
                [
                  'case',
                  ['==', ['get', 'health'], 'healthy'], '#2ecc71',
                  ['==', ['get', 'health'], 'stressed'], '#f39c12',
                  ['==', ['get', 'health'], 'dead'], '#e74c3c',
                  '#95a5a6' // default gray
                ],
                '#27ae60' // default green if no status/health attribute
              ],
              'circle-stroke-color': '#1e5e3a',
              'circle-stroke-width': [
                'interpolate',
                ['linear'],
                ['zoom'],
                15, 0.5,
                20, 1
              ],
            'circle-opacity': 0.9
          }
        });

        // Tree labels at high zoom with collision avoidance
        map.current.addLayer({
          id: 'orchard-tree-labels',
          type: 'symbol',
          source: 'orchard-vectors',
          'source-layer': sourceLayerName,
          minzoom: 18,
          layout: {
              'text-field': ['get', 'name'],
              'text-font': ['Noto Sans Regular', 'Arial Unicode MS Regular'],
              'text-size': 11,
              'text-offset': [0, 1.2],
              'text-anchor': 'top',
              'text-allow-overlap': false,
              'text-ignore-placement': false,
              'text-optional': true // Allow some labels to be hidden if crowded
            },
            paint: {
              'text-color': '#ffffff',
              'text-halo-color': '#000000',
              'text-halo-width': 1.5,
            'text-halo-blur': 0.5
          }
        });

        // Selected tree label (always visible)
        map.current.addLayer({
          id: 'orchard-tree-labels-selected',
          type: 'symbol',
          source: 'orchard-vectors',
          'source-layer': sourceLayerName,
          minzoom: 18,
          filter: ['==', ['get', 'tree_id'], ''], // Initially empty
          layout: {
              'text-field': ['get', 'name'],
              'text-font': ['Noto Sans Regular', 'Arial Unicode MS Regular'],
              'text-size': 12,
              'text-offset': [0, 1.2],
              'text-anchor': 'top',
              'text-allow-overlap': true, // Always show selected tree label
              'text-ignore-placement': true
            },
            paint: {
              'text-color': '#ffff00', // Yellow for selected
              'text-halo-color': '#000000',
              'text-halo-width': 2,
            'text-halo-blur': 0.5
          }
        });
      }

      console.log('Map loaded. Orthomosaic layer:', map.current?.getLayer('orchard-orthomosaic-layer') ? 'exists' : 'missing');

      if (pmtilesValid) {
        // Change cursor on hover
        map.current?.on('mouseenter', 'orchard-trees', () => {
          if (map.current) map.current.getCanvas().style.cursor = 'pointer';
        });

        map.current?.on('mouseleave', 'orchard-trees', () => {
          if (map.current) map.current.getCanvas().style.cursor = '';
        });
      }
    });

    // Add navigation controls
    map.current.addControl(new maplibregl.NavigationControl(), 'top-right');

    // Add scale control
    map.current.addControl(new maplibregl.ScaleControl({
      maxWidth: 100,
      unit: 'metric'
    }), 'bottom-left');

    // Add error handler for map errors
    map.current.on('error', (e) => {
      // Silently handle PMTiles-related errors
      if (!e.error?.message?.includes('Unimplemented type') &&
          !e.error?.message?.includes('parse')) {
        console.error('Map error:', e.error?.message || e);
      }
    });

    // Handle tree click events
    map.current.on('click', 'orchard-trees', async (e) => {
      if (!e.features || !e.features[0]) return;
      if (!map.current) return;

      const feature = e.features[0];
      const properties = feature.properties as TreeProperties;

      // Close existing popup
      if (popupRef.current) {
        popupRef.current.remove();
        popupRef.current = null;
      }

      // Get the exact click coordinates
      const clickCoordinates: [number, number] = [e.lngLat.lng, e.lngLat.lat];

      // Set selected tree ID and feature
      setSelectedTreeId(properties.tree_id || properties.name || null);
      setSelectedTreeFeature(feature);

      // Force selected tree label to show
      if (map.current && feature) {
        // Temporarily allow overlap for selected tree
        const filter = ['==', ['get', 'tree_id'], properties.tree_id || ''];
        map.current.setFilter('orchard-tree-labels-selected', filter);
      }

      // Try to fetch detailed data from API (prepared for future)
      const details = properties.tree_id ? await fetchTreeDetails(properties.tree_id) : null;

      // Create popup with all settings at once
      const popup = new maplibregl.Popup({
        closeButton: true,
        closeOnClick: true,
        className: 'orchard-popup no-animation', // Add no-animation class
        maxWidth: '320px',
        offset: [0, -10], // Offset to position above the circle
        anchor: 'bottom',
        trackPointer: false // Don't track pointer, use fixed position
      })
        .setLngLat(clickCoordinates)
        .setDOMContent(createPopupContent(properties, details))
        .addTo(map.current);

      // Store reference
      popupRef.current = popup;

      // Handle popup close
      popup.on('close', () => {
        setSelectedTreeId(null);
        setSelectedTreeFeature(null);
        popupRef.current = null;
        // Reset label overlap for selected tree
        if (map.current && selectedTreeFeature) {
          map.current.setLayoutProperty('orchard-tree-labels', 'text-allow-overlap', false);
        }
      });
    });

    // Change cursor to pointer when hovering over trees
    map.current.on('mouseenter', 'orchard-trees', (e) => {
      if (map.current) {
        map.current.getCanvas().style.cursor = 'pointer';

        // Optional: Add hover effect by changing tree stroke
        if (e.features && e.features[0] && e.features[0].properties?.tree_id) {
          map.current.setPaintProperty('orchard-trees', 'circle-stroke-width', [
            'case',
            ['==', ['get', 'tree_id'], e.features[0].properties.tree_id],
            2,
            [
              'interpolate',
              ['linear'],
              ['zoom'],
              15, 0.5,
              20, 1
            ]
          ]);
        }
      }
    });

    // Reset cursor and hover effect when leaving trees
    map.current.on('mouseleave', 'orchard-trees', () => {
      if (map.current) {
        map.current.getCanvas().style.cursor = '';

        // Reset hover effect
        map.current.setPaintProperty('orchard-trees', 'circle-stroke-width', [
          'interpolate',
          ['linear'],
          ['zoom'],
          15, 0.5,
          20, 1
        ]);
      }
    });


    }; // Close initializeMap function

    // Call the async initialization
    initializeMap();

    // Add keyboard event listener after map initialization
    document.addEventListener('keydown', handleKeyPress);

    // Cleanup on unmount
    return () => {
      // Reset initialization flag
      isInitializing.current = false;

      // Remove keyboard listener
      document.removeEventListener('keydown', handleKeyPress);

      // Clean up popup
      if (popupRef.current) {
        popupRef.current.remove();
        popupRef.current = null;
      }

      // Clean up map
      if (map.current) {
        map.current.remove();
        map.current = null;
      }

      // Remove PMTiles protocol if it was added
      try {
        maplibregl.removeProtocol('pmtiles');
      } catch (e) {
        // Protocol might not exist, ignore error
      }
    };
  }, [orchard]); // Re-render if orchard changes

  return (
    <div className="h-screen w-screen relative">
      <div ref={mapContainer} className="h-full w-full bg-gray-200" />

      {/* Orchard Info Header with Switcher */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg px-4 py-2 z-10">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-lg font-bold text-gray-900">{orchard.name}</h1>
            <p className="text-sm text-gray-600">{orchard.location}</p>
          </div>
          <button
            onClick={() => setShowOrchardSelector(!showOrchardSelector)}
            className="ml-4 px-3 py-1.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors flex items-center gap-1"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 9l4-4 4 4m0 6l-4 4-4-4"
              />
            </svg>
            Switch Orchard
          </button>
        </div>
      </div>

      {/* Orchard Selector Dropdown */}
      {showOrchardSelector && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-white rounded-lg shadow-xl p-2 z-20 min-w-[300px] max-h-[400px] overflow-y-auto">
          <div className="sticky top-0 bg-white pb-2 mb-2 border-b">
            <h3 className="text-sm font-semibold text-gray-700">Select Orchard</h3>
          </div>
          {allOrchards.map((o) => (
            <button
              key={o.id}
              onClick={() => {
                setShowOrchardSelector(false);
                if (o.id !== orchard.id) {
                  router.push(`/orchard/${o.id}`);
                }
              }}
              className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                o.id === orchard.id
                  ? 'bg-green-50 border border-green-300'
                  : 'hover:bg-gray-50'
              }`}
            >
              <div className="font-medium text-gray-900">{o.name}</div>
              <div className="text-xs text-gray-500">{o.location}</div>
              {o.stats && (
                <div className="text-xs text-gray-400 mt-1">
                  {o.stats.trees && `${o.stats.trees} trees`}
                  {o.stats.acres && ` • ${o.stats.acres} acres`}
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Home Button */}
      <button
        onClick={() => router.push('/')}
        className="absolute top-4 left-4 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg p-2 z-10 hover:bg-white transition-colors"
        aria-label="Back to home"
      >
        <svg
          className="w-5 h-5 text-gray-700"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
          />
        </svg>
      </button>

      {/* Optional: Selected tree indicator with close button */}
      {selectedTreeId && (
        <div className="absolute bottom-4 left-4 bg-white rounded-lg shadow-lg p-3 max-w-xs flex items-center justify-between animate-fade-in">
          <p className="text-sm text-gray-600">
            Selected: <span className="font-medium text-gray-900">Tree {selectedTreeId}</span>
          </p>
          <button
            onClick={() => {
              setSelectedTreeId(null);
              setSelectedTreeFeature(null);
              if (popupRef.current) {
                popupRef.current.remove();
                popupRef.current = null;
              }
              // Clear selected tree label filter
              if (map.current) {
                map.current.setFilter('orchard-tree-labels-selected', ['==', ['get', 'tree_id'], '']);
              }
            }}
            className="ml-2 text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close selection"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}