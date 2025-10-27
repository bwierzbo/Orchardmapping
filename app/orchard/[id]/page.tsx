'use client';

import { useEffect, useRef, useState, use, useCallback } from 'react';
import { notFound, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import maplibregl from 'maplibre-gl';
import { PMTiles, Protocol } from 'pmtiles';
import 'maplibre-gl/dist/maplibre-gl.css';
import './popup-styles.css';
import { getOrchardById, getAllOrchards, OrchardConfig } from '../../../lib/orchards';
import { validatePMTiles } from '../../../lib/pmtiles-utils';
import BulkTreeImport from './components/BulkTreeImport';
import { ToastContainer, ToastProps } from '@/components/Toast';

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
  const { data: session } = useSession();

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
  const createPopupContentRef = useRef<any>(null);
  const fetchTreeDetailsRef = useRef<any>(null);

  // Refs for edit mode state (to access current values in map click handler)
  const isEditModeRef = useRef(false);
  const currentRowRef = useRef('');
  const currentPositionRef = useRef(1);
  const autoIncrementRef = useRef(false);

  const [selectedTreeId, setSelectedTreeId] = useState<string | null>(null);
  const [selectedTreeFeature, setSelectedTreeFeature] = useState<any>(null);
  const [showOrchardSelector, setShowOrchardSelector] = useState(false);
  const [pmtilesEnabled, setPmtilesEnabled] = useState(false);

  // Edit mode state
  const [isEditMode, setIsEditMode] = useState(false);
  const [currentRow, setCurrentRow] = useState('');
  const [currentPosition, setCurrentPosition] = useState(1);
  const [trees, setTrees] = useState<TreeDetails[]>([]);
  const [autoIncrement, setAutoIncrement] = useState(true);

  // Tree editing state
  const [isEditingTree, setIsEditingTree] = useState(false);
  const [editingTree, setEditingTree] = useState<TreeDetails | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Drag state
  const [isDragging, setIsDragging] = useState(false);
  const dragStartPos = useRef<{ lat: number; lng: number } | null>(null);

  // Toast notifications
  const [toasts, setToasts] = useState<ToastProps[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Toast helper functions
  const showToast = useCallback((type: ToastProps['type'], message: string, duration = 3000) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts(prev => [...prev, { id, type, message, duration, onClose: removeToast }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Function to fetch tree details from API
  const fetchTreeDetails = useCallback(async (treeId: string): Promise<TreeDetails | null> => {
    try {
      const response = await fetch(`/api/trees/${treeId}`);
      if (!response.ok) {
        if (response.status === 404) {
          // Tree not found in database, return null to use PMTiles data
          return null;
        }
        throw new Error('Failed to fetch tree details');
      }
      const data = await response.json();

      // API returns { success: true, tree: {...} }
      const treeData = data.tree || data;

      // Convert database format to frontend format
      return {
        tree_id: treeData.tree_id,
        name: treeData.name,
        variety: treeData.variety,
        health: treeData.status,
        status: treeData.status,
        age: treeData.age,
        height: treeData.height,
        planted_date: treeData.planted_date,
        block_id: treeData.block_id,
        row_id: treeData.row_id,
        position: treeData.position,
        lat: treeData.lat,
        lng: treeData.lng,
        last_pruned: treeData.last_pruned,
        last_harvest: treeData.last_harvest,
        yield_estimate: treeData.yield_estimate,
        notes: treeData.notes
      };
    } catch (error) {
      console.error('Error fetching tree details:', error);
      return null;
    }
  }, []);

  // Function to create popup content with Tailwind styling
  const createPopupContent = useCallback((
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
      saveButton.onclick = async () => {
        // Collect edited values
        const editedData: any = { ...properties };

        // Get all input fields
        container.querySelectorAll('input[data-key], select[data-key]').forEach((elem: any) => {
          editedData[elem.dataset.key] = elem.value;
        });

        // Save to backend API
        try {
          const response = await fetch(`/api/trees/${editedData.tree_id}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              orchard_id: orchard?.id,
              ...editedData
            }),
          });

          if (response.ok) {
            const updatedTree = await response.json();

            // Update the local display with saved data
            if (popupRef.current) {
              popupRef.current.setDOMContent(createPopupContentRef.current?.(updatedTree, updatedTree, false, false));
            }

            // Update the map feature properties (for visual feedback)
            if (map.current && selectedTreeFeature) {
              // Update the visual appearance based on new status
              const newStatus = updatedTree.status;
              if (newStatus) {
                // Update the circle color based on new status
                const colors: { [key: string]: string } = {
                  'healthy': '#2ecc71',
                  'stressed': '#f39c12',
                  'dead': '#e74c3c',
                  'unknown': '#95a5a6'
                };

                // Update the feature properties
                selectedTreeFeature.properties = updatedTree;
              }
            }
          } else {
            console.error('Failed to save tree data');
            alert('Failed to save tree data. Please try again.');
          }
        } catch (error) {
          console.error('Error saving tree:', error);
          alert('Error saving tree data. Please try again.');
        }
      };

      const cancelButton = document.createElement('button');
      cancelButton.className = 'flex-1 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-50 rounded hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-1';
      cancelButton.textContent = 'Cancel';
      cancelButton.onclick = () => {
        // Exit edit mode without saving
        if (popupRef.current) {
          popupRef.current.setDOMContent(createPopupContentRef.current?.(properties, details, false, false));
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
          const loadingContent = createPopupContentRef.current?.(properties, null, true, false);
          popupRef.current.setDOMContent(loadingContent);

          // Fetch and update with full details
          const fullDetails = await fetchTreeDetailsRef.current?.(data.tree_id);

          // Small delay to show loading state
          await new Promise(resolve => setTimeout(resolve, 300));

          if (popupRef.current) {
            const newContent = createPopupContentRef.current?.(properties, fullDetails || properties, false, false);
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
          popupRef.current.setDOMContent(createPopupContentRef.current?.(properties, details, false, true));
        }
      };

      actions.appendChild(viewButton);
      actions.appendChild(editButton);
    }

    container.appendChild(actions);

    return container;
  }, []);

  // Store stable references to callbacks
  createPopupContentRef.current = createPopupContent;
  fetchTreeDetailsRef.current = fetchTreeDetails;

  // Helper function to get marker color based on status
  const getMarkerColor = useCallback((status?: string): string => {
    switch (status) {
      case 'healthy':
        return '#10b981'; // Green
      case 'stressed':
        return '#f59e0b'; // Yellow/Orange
      case 'dead':
        return '#ef4444'; // Red
      case 'unknown':
      default:
        return '#6b7280'; // Gray
    }
  }, []);

  // Helper function to apply marker styles
  const getMarkerStyle = useCallback((el: HTMLElement, status?: string, isNew: boolean = false) => {
    const baseSize = isEditMode ? 14 : 12; // Slightly larger in edit mode

    el.className = 'tree-marker';
    el.style.width = `${baseSize}px`;
    el.style.height = `${baseSize}px`;
    el.style.borderRadius = '50%';
    el.style.backgroundColor = getMarkerColor(status);
    el.style.border = '2px solid white';
    el.style.cursor = isEditMode ? 'move' : 'pointer';
    el.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';
    el.style.transition = 'transform 0.3s ease, box-shadow 0.3s ease';

    // Add fade-in and pulse for new trees
    if (isNew) {
      el.style.animation = 'fadeInPulse 2s ease-out';
    }
  }, [isEditMode, getMarkerColor]);

  // Load trees function
  const loadTrees = useCallback(async () => {
    if (!orchard) return;

    try {
      setIsLoading(true);
      const response = await fetch(`/api/trees?orchard_id=${orchard.id}`);
      if (response.ok) {
        const data = await response.json();
        setTrees(data.trees || []);
      } else {
        showToast('error', 'Failed to load trees');
      }
    } catch (error) {
      console.error('Error loading trees:', error);
      showToast('error', 'Error loading trees');
    } finally {
      setIsLoading(false);
    }
  }, [orchard, showToast]);

  // Load trees on mount
  useEffect(() => {
    loadTrees();
  }, [loadTrees]);

  // Sync refs with state for map click handler
  useEffect(() => {
    isEditModeRef.current = isEditMode;
    currentRowRef.current = currentRow;
    currentPositionRef.current = currentPosition;
    autoIncrementRef.current = autoIncrement;
    console.log('📝 Refs updated:', {
      isEditMode: isEditModeRef.current,
      currentRow: currentRowRef.current,
      currentPosition: currentPositionRef.current,
      autoIncrement: autoIncrementRef.current
    });
  }, [isEditMode, currentRow, currentPosition, autoIncrement]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if user is typing in an input
      if ((e.target as HTMLElement).tagName === 'INPUT' ||
          (e.target as HTMLElement).tagName === 'TEXTAREA' ||
          (e.target as HTMLElement).tagName === 'SELECT') {
        return;
      }

      switch (e.key) {
        case 'Escape':
          // Exit edit mode or close modal
          if (isEditingTree) {
            setIsEditingTree(false);
            setEditingTree(null);
            setShowDeleteConfirm(false);
          } else if (isEditMode) {
            setIsEditMode(false);
            setCurrentRow('');
            setCurrentPosition(1);
          }
          break;

        case 'e':
        case 'E':
          // Toggle edit mode (only if not in edit modal)
          if (!isEditingTree) {
            setIsEditMode(!isEditMode);
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isEditMode, isEditingTree]);

  // Render tree markers for database trees not in PMTiles
  useEffect(() => {
    if (!map.current || trees.length === 0) return;

    const markers: maplibregl.Marker[] = [];
    const tooltips: HTMLElement[] = [];

    // Add markers for each tree
    trees.forEach((tree) => {
      if (tree.lat && tree.lng) {
        // Create outer container (this will be positioned by MapLibre)
        const el = document.createElement('div');

        // Create inner marker element that we can transform
        const markerInner = document.createElement('div');

        // Check if tree is new (created in last 5 seconds)
        const isNew = Date.now() - new Date(tree.created_at || 0).getTime() < 5000;

        // Apply marker styles using helper function
        getMarkerStyle(markerInner, tree.status, isNew);

        // Create tooltip element
        const tooltip = document.createElement('div');
        tooltip.className = 'tree-marker-tooltip';
        tooltip.textContent = tree.tree_id || `Row ${tree.row_id}, Pos ${tree.position}`;
        tooltip.style.cssText = `
          position: absolute;
          bottom: 100%;
          left: 50%;
          transform: translateX(-50%) translateY(-4px);
          background: rgba(0, 0, 0, 0.8);
          color: white;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 11px;
          white-space: nowrap;
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.2s ease;
          z-index: 1000;
        `;
        markerInner.appendChild(tooltip);
        el.appendChild(markerInner);
        tooltips.push(tooltip);

        // Hover effects - transform the inner element only
        el.addEventListener('mouseenter', () => {
          tooltip.style.opacity = '1';
          if (!isEditMode) {
            markerInner.style.transform = 'scale(1.3)';
          }
        });

        el.addEventListener('mouseleave', () => {
          tooltip.style.opacity = '0';
          if (!isEditMode) {
            markerInner.style.transform = 'scale(1)';
          }
        });

        // Create marker with draggable option based on edit mode
        const marker = new maplibregl.Marker({
          element: el,
          draggable: isEditMode,
          anchor: 'center' // Anchor marker at center to prevent shifting
        })
          .setLngLat([tree.lng, tree.lat])
          .addTo(map.current!);

        // Track if this was a drag or click
        let hasDragged = false;
        let clickTimer: NodeJS.Timeout | null = null;

        // Drag start handler
        marker.on('dragstart', () => {
          hasDragged = false;
          setIsDragging(true);
          dragStartPos.current = { lat: tree.lat!, lng: tree.lng! };

          // Visual feedback during drag - transform inner element only
          markerInner.style.transform = 'scale(1.5)';
          markerInner.style.opacity = '0.7';
          markerInner.style.boxShadow = '0 4px 8px rgba(0,0,0,0.5)';
          tooltip.style.opacity = '0'; // Hide tooltip while dragging
        });

        // Drag handler
        marker.on('drag', () => {
          hasDragged = true;
        });

        // Drag end handler
        marker.on('dragend', async () => {
          const lngLat = marker.getLngLat();

          // Reset visual feedback
          markerInner.style.opacity = '1';
          markerInner.style.transform = 'scale(1)';
          markerInner.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';

          // Update position in database
          await handleTreeDragEnd(tree, lngLat.lat, lngLat.lng, marker);
        });

        // Click handler to show tree details or edit form
        el.addEventListener('click', async (e) => {
          // Stop event propagation to prevent map click handler from firing
          e.stopPropagation();

          // Use a small delay to distinguish click from drag start
          clickTimer = setTimeout(async () => {
            if (!hasDragged && !isDragging) {
              if (isEditMode) {
                // In edit mode, open edit form
                console.log('Tree clicked in edit mode:', JSON.stringify(tree, null, 2));
                if (!tree.tree_id) {
                  console.error('Tree has no tree_id:', JSON.stringify(tree, null, 2));
                  showToast('error', 'Cannot edit tree without tree_id');
                  return;
                }
                const details = await fetchTreeDetails(tree.tree_id);
                console.log('Fetched tree details:', JSON.stringify(details, null, 2));
                console.log('Setting editingTree to:', details || tree);
                setEditingTree(details || tree);
                setIsEditingTree(true);
              } else {
                // Normal mode, show popup
                const details = await fetchTreeDetails(tree.tree_id);
                if (map.current) {
                  const popup = new maplibregl.Popup({ closeButton: true, closeOnClick: true })
                    .setLngLat([tree.lng, tree.lat])
                    .setDOMContent(createPopupContent(tree, details || tree))
                    .addTo(map.current);

                  popupRef.current = popup;
                  setSelectedTreeId(tree.tree_id);
                  setSelectedTreeFeature({ properties: tree });
                }
              }
            }
            hasDragged = false;
          }, 100);
        });

        // Reset drag flag on mouse up
        el.addEventListener('mouseup', () => {
          setTimeout(() => {
            hasDragged = false;
          }, 150);
        });

        markers.push(marker);
      }
    });

    // Cleanup markers on unmount or when trees change
    return () => {
      markers.forEach(marker => marker.remove());
    };
  }, [trees, isEditMode, createPopupContent, fetchTreeDetails, isDragging, getMarkerStyle]);

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
        // Clear selected tree label filter (only if layer exists)
        if (map.current && map.current.getLayer('orchard-tree-labels-selected')) {
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
      console.log('🗺️ Initializing map...');
      // Clear any existing map content in the container
      if (mapContainer.current) {
        mapContainer.current.innerHTML = '';
      }
      // Register PMTiles protocol with error handling
      let protocol: Protocol | null = null;

      // Validate and load PMTiles if it exists
      let pmtilesValid = false;
      let sourceLayerName = 'default'; // Default layer name

      // Register protocol if we have ANY PMTiles files (ortho or vector)
      if (orchard.orthoPmtilesPath || orchard.pmtilesPath) {
        try {
          // Remove any existing protocol first
          maplibregl.removeProtocol('pmtiles');
        } catch (e) {
          // Protocol doesn't exist, that's fine
        }

        protocol = new Protocol();
        maplibregl.addProtocol('pmtiles', protocol.tile);

        // Add orthomosaic PMTiles if it exists
        if (orchard.orthoPmtilesPath) {
          try {
            // PMTiles needs the full URL when running in browser
            const orthoUrl = window.location.origin + orchard.orthoPmtilesPath;
            const orthoPMTiles = new PMTiles(orthoUrl);
            protocol.add(orthoPMTiles);
            console.log('Registered orthomosaic PMTiles:', orthoUrl);
          } catch (error) {
            console.error('Failed to register orthomosaic PMTiles:', error);
          }
        }

        // Add vector PMTiles if it exists
        if (orchard.pmtilesPath) {
          const vectorUrl = window.location.origin + orchard.pmtilesPath;
          const validation = await validatePMTiles(vectorUrl);

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

            try {
              // vectorUrl already defined above for validation
              const vectorPMTiles = new PMTiles(vectorUrl);
              protocol.add(vectorPMTiles);
              console.log('Registered vector PMTiles:', vectorUrl);
            } catch (error) {
              console.error('Failed to register vector PMTiles:', error);
            }
          } else {
            pmtilesValid = false;
            setPmtilesEnabled(false);
          }
        }
      }

    // Create map with orthomosaic tiles from PMTiles or public directory
    map.current = new maplibregl.Map({
      container: mapContainer.current!,
      style: {
        version: 8,
        glyphs: 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf',
        layers: [],
        sources: {
          // Add OpenStreetMap basemap
          'osm-raster': {
            type: 'raster',
            tiles: [
              'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
              'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
              'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png'
            ],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors',
            maxzoom: 19
          },
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
          } : orchard.orthoPath ? {
            'orchard-orthomosaic': {
              // Use regular tiles (XYZ or API)
              type: 'raster',
              tiles: [orchard.orthoPath],
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
      // Add basemap layer first
      if (map.current && !map.current.getLayer('osm-basemap')) {
        map.current.addLayer({
          id: 'osm-basemap',
          type: 'raster',
          source: 'osm-raster',
          minzoom: 0,
          maxzoom: 22,
          paint: {
            'raster-opacity': 0.8, // Slightly transparent to blend with orthomosaic
            'raster-fade-duration': 100
          }
        });
      }

      // Add orthomosaic layer if available (on top of basemap)
      if ((orchard.orthoPmtilesPath || orchard.orthoPath) && map.current && !map.current.getLayer('orchard-orthomosaic-layer')) {
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
        if (!map.current.getLayer('orchard-trees')) {
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
        }

        // Tree labels at high zoom with collision avoidance
        if (!map.current.getLayer('orchard-tree-labels')) {
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
        }

        // Selected tree label (always visible)
        if (!map.current.getLayer('orchard-tree-labels-selected')) {
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
      }

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

    // Handle general map clicks for edit mode tree placement
    map.current.on('click', async (e) => {
      console.log('Map clicked!', {
        isEditMode: isEditModeRef.current,
        row: currentRowRef.current,
        position: currentPositionRef.current
      });

      // Only handle if in edit mode and not clicking on an existing tree
      // Use ref values to get current state (not closure-captured values)
      if (!isEditModeRef.current) {
        console.log('Not in edit mode, ignoring click');
        return;
      }

      // Check if clicking on an existing tree layer (only if layer exists)
      let features: any[] = [];
      if (map.current && map.current.getLayer('orchard-trees')) {
        features = map.current.queryRenderedFeatures(e.point, {
          layers: ['orchard-trees']
        });
        console.log('Features at click point:', features);
      } else {
        console.log('orchard-trees layer does not exist, skipping feature check');
      }

      // If clicking on an existing tree, let the tree click handler deal with it
      if (features && features.length > 0) {
        console.log('Clicked on existing tree, skipping');
        return;
      }

      // Validate inputs - use ref values
      const row = currentRowRef.current;
      const position = currentPositionRef.current;

      console.log('Placing tree at row:', row, 'position:', position);

      if (!row || !position) {
        console.log('Missing row or position');
        showToast('warning', 'Please enter both row ID and position before placing a tree');
        return;
      }

      try {
        const { lng, lat } = e.lngLat;

        // Create tree data
        const treeData = {
          orchard_id: orchard.id,
          row_id: row,
          position: position,
          lat,
          lng,
          status: 'healthy' // Default status
        };

        // Send to API
        const response = await fetch('/api/trees', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(treeData),
        });

        if (response.ok) {
          const result = await response.json();

          // Add to local trees state
          setTrees(prev => [...prev, result.tree]);

          // Auto-increment position if enabled - use ref value
          if (autoIncrementRef.current) {
            setCurrentPosition(prev => prev + 1);
          }

          // Show success feedback
          showToast('success', `Tree added at Row ${row}, Position ${position}`);
        } else {
          const error = await response.json();
          if (error.error?.includes('Duplicate')) {
            showToast('error', `Duplicate tree at Row ${row}, Position ${position}`);
          } else {
            showToast('error', `Failed to place tree: ${error.details || error.error}`);
          }
        }
      } catch (error: any) {
        console.error('Error placing tree:', error);
        showToast('error', `Error placing tree: ${error.message}`);
      }
    });

    console.log('✅ Map click handler for tree placement registered');

    // Handle tree click events
    map.current.on('click', 'orchard-trees', async (e) => {
      try {
        e.preventDefault?.(); // Prevent any default behavior

        if (!e.features || !e.features[0]) {
          return;
        }
        if (!map.current) {
          return;
        }

        const feature = e.features[0];
        const properties = feature.properties as TreeProperties;

        // In edit mode, open edit form instead of popup - use ref value
        if (isEditModeRef.current && properties.tree_id) {
          const details = await fetchTreeDetailsRef.current?.(properties.tree_id);
          // Only open edit form if we have details from database or properties has tree_id
          if (details && details.tree_id) {
            setEditingTree(details);
            setIsEditingTree(true);
            return;
          } else if (!details) {
            // Tree exists in PMTiles but not in database - can't edit
            showToast('warning', 'This tree exists in the map file but not in the database. Cannot edit or delete.');
            return;
          }
        }

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
        // Temporarily allow overlap for selected tree (only if layer exists)
        const layer = map.current.getLayer('orchard-tree-labels-selected');
        if (layer) {
          const filter: any = ['==', ['get', 'tree_id'], properties.tree_id || ''];
          map.current.setFilter('orchard-tree-labels-selected', filter);
        }
      }

      // Try to fetch detailed data from API (prepared for future)
      const details = properties.tree_id ? await fetchTreeDetailsRef.current?.(properties.tree_id) : null;

      // Create popup with all settings at once
      const popup = new maplibregl.Popup({
        closeButton: true,
        closeOnClick: true,
        className: 'orchard-popup no-animation', // Add no-animation class
        maxWidth: '320px',
        offset: [0, -10], // Offset to position above the circle
        anchor: 'bottom'
      })
        .setLngLat(clickCoordinates)
        .setDOMContent(createPopupContentRef.current?.(properties, details))
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
      } catch (error) {
        console.error('Error in tree click handler:', error);
      }
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
  }, [orchard]); // Only re-render if orchard changes

  // Handle save tree changes
  const handleSaveTree = async () => {
    if (!editingTree || !editingTree.tree_id) return;

    setIsSaving(true);
    try {
      const response = await fetch(`/api/trees/${editingTree.tree_id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          variety: editingTree.variety,
          status: editingTree.status,
          planted_date: editingTree.planted_date,
          age: editingTree.age,
          height: editingTree.height,
          last_pruned: editingTree.last_pruned,
          last_harvest: editingTree.last_harvest,
          yield_estimate: editingTree.yield_estimate,
          notes: editingTree.notes,
        }),
      });

      if (response.ok) {
        const result = await response.json();

        // Update trees in local state
        setTrees(prev => prev.map(t =>
          t.tree_id === editingTree.tree_id ? result.tree : t
        ));

        // Close modal
        setIsEditingTree(false);
        setEditingTree(null);

        // Show success
        showToast('success', `Tree ${editingTree.tree_id} updated successfully`);
      } else {
        const error = await response.json();
        showToast('error', `Failed to save tree: ${error.details || error.error}`);
      }
    } catch (error: any) {
      console.error('Error saving tree:', error);
      showToast('error', `Error saving tree: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle delete tree
  const handleDeleteTree = async () => {
    console.log('handleDeleteTree called with:', editingTree);
    if (!editingTree || !editingTree.tree_id) {
      console.error('Cannot delete: missing editingTree or tree_id', editingTree);
      showToast('error', 'Cannot delete tree: missing tree ID');
      return;
    }

    setIsSaving(true);
    try {
      console.log('Deleting tree:', editingTree.tree_id);
      const response = await fetch(`/api/trees/${editingTree.tree_id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        // Remove tree from local state
        setTrees(prev => prev.filter(t => t.tree_id !== editingTree.tree_id));

        const treeId = editingTree.tree_id;

        // Close modal and confirmation
        setIsEditingTree(false);
        setEditingTree(null);
        setShowDeleteConfirm(false);

        // Show success
        showToast('success', `Tree ${treeId} deleted successfully`);
      } else {
        const error = await response.json();
        showToast('error', `Failed to delete tree: ${error.details || error.error}`);
      }
    } catch (error: any) {
      console.error('Error deleting tree:', error);
      showToast('error', `Error deleting tree: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle tree drag end - update position
  const handleTreeDragEnd = async (tree: TreeDetails, newLat: number, newLng: number, marker: maplibregl.Marker) => {
    if (!tree.tree_id) return;

    try {
      const response = await fetch(`/api/trees/${tree.tree_id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          lat: newLat,
          lng: newLng,
        }),
      });

      if (response.ok) {
        const result = await response.json();

        // Update trees in local state
        setTrees(prev => prev.map(t =>
          t.tree_id === tree.tree_id ? result.tree : t
        ));

        // Show success with highlight animation
        const el = marker.getElement();
        el.style.animation = 'highlightPulse 0.6s ease-out';
        setTimeout(() => {
          el.style.animation = '';
        }, 600);

        showToast('success', `Tree ${tree.tree_id} repositioned`);
      } else {
        const error = await response.json();
        console.error('Failed to update position:', error);

        // Revert to original position on error
        if (dragStartPos.current) {
          marker.setLngLat([dragStartPos.current.lng, dragStartPos.current.lat]);
        }
        showToast('error', `Failed to reposition tree: ${error.details || error.error}`);
      }
    } catch (error: any) {
      console.error('Error updating tree position:', error);

      // Revert to original position on error
      if (dragStartPos.current) {
        marker.setLngLat([dragStartPos.current.lng, dragStartPos.current.lat]);
      }
      showToast('error', `Error repositioning tree: ${error.message}`);
    } finally {
      setIsDragging(false);
      dragStartPos.current = null;
    }
  };

  // Handle invalid orchard ID or loading state
  if (!orchardId) {
    return <div className="h-screen w-screen flex items-center justify-center">Loading...</div>;
  }

  if (!orchard) {
    notFound();
  }

  return (
    <div className="h-screen w-screen relative">
      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onClose={removeToast} />

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-6 shadow-2xl flex flex-col items-center gap-3">
            <div className="w-12 h-12 border-4 border-green-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-gray-700 font-medium">Loading trees...</p>
          </div>
        </div>
      )}

      <div
        ref={mapContainer}
        className={`h-full w-full bg-gray-200 ${isEditMode ? 'cursor-crosshair ring-4 ring-green-500 ring-inset' : ''}`}
      />

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
              {o.stats && o.stats.trees !== undefined && (
                <div className="text-xs text-gray-400 mt-1">
                  {o.stats.trees} trees
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

      {/* Bottom Toolbar - Centered */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-3 z-10">
        {/* Bulk Import Button - Only show when authenticated and not in edit mode */}
        {session && !isEditMode && (
          <BulkTreeImport
            orchardId={orchard.id}
            onImportComplete={loadTrees}
          />
        )}

        <button
          onClick={() => {
            if (isEditMode) {
              setIsEditMode(false);
              setCurrentRow('');
              setCurrentPosition(1);
            } else {
              setIsEditMode(true);
            }
          }}
          className={`px-6 py-3 rounded-lg shadow-lg font-medium transition-all ${
            isEditMode
              ? 'bg-red-600 text-white hover:bg-red-700'
              : 'bg-white/95 text-gray-700 hover:bg-white backdrop-blur-sm'
          }`}
          aria-label={isEditMode ? 'Exit Edit Mode' : 'Enter Edit Mode'}
        >
          {isEditMode ? (
            <span className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Exit Edit Mode
            </span>
          ) : (
            'Enter Edit Mode'
          )}
        </button>
      </div>

      {/* Edit Mode Panel */}
      {isEditMode && (
        <div className="absolute top-20 left-4 bg-white/95 backdrop-blur-sm rounded-lg shadow-xl p-4 z-10 w-full max-w-[280px] sm:max-w-sm">
          <div className="border-l-4 border-green-600 pl-3 mb-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-900 text-base sm:text-lg">Edit Mode Active</h3>
              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded font-mono">
                ESC
              </span>
            </div>
            <p className="text-xs sm:text-sm text-gray-600 mt-1">
              Click on the map to place trees at the specified row and position
            </p>
          </div>

          <div className="space-y-3">
            {/* Row ID Input */}
            <div>
              <label htmlFor="row-input" className="block text-sm font-medium text-gray-700 mb-1">
                Row ID
              </label>
              <input
                id="row-input"
                type="text"
                value={currentRow}
                onChange={(e) => setCurrentRow(e.target.value)}
                placeholder="e.g., 1, A, R1"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>

            {/* Position Input */}
            <div>
              <label htmlFor="position-input" className="block text-sm font-medium text-gray-700 mb-1">
                Position
              </label>
              <input
                id="position-input"
                type="number"
                min="1"
                value={currentPosition}
                onChange={(e) => setCurrentPosition(parseInt(e.target.value) || 1)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>

            {/* Auto-increment Checkbox */}
            <div className="flex items-center">
              <input
                id="auto-increment"
                type="checkbox"
                checked={autoIncrement}
                onChange={(e) => setAutoIncrement(e.target.checked)}
                className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
              />
              <label htmlFor="auto-increment" className="ml-2 text-sm text-gray-700">
                Auto-increment position after placing
              </label>
            </div>

            {/* Current Values Display */}
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
              <p className="text-xs font-medium text-gray-500 mb-1">Next Tree ID</p>
              <p className="text-sm font-mono text-gray-900">
                {currentRow && currentPosition
                  ? `${orchard.id}-R${String(currentRow).padStart(2, '0')}-P${String(currentPosition).padStart(3, '0')}`
                  : 'Enter row and position'}
              </p>
            </div>

            {/* Instructions */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-xs text-blue-800">
                <span className="font-semibold">Instructions:</span> Fill in the row and position, then click anywhere on the map to place a tree at that location.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Edit Mode Visual Indicator - Border around map */}
      {isEditMode && (
        <div className="absolute inset-0 pointer-events-none border-4 border-green-500 z-[5] rounded-lg"
             style={{ boxShadow: 'inset 0 0 20px rgba(34, 197, 94, 0.3)' }} />
      )}

      {/* Optional: Selected tree indicator with close button */}
      {selectedTreeId && !isEditingTree && (
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
              // Clear selected tree label filter (only if layer exists)
              if (map.current && map.current.getLayer('orchard-tree-labels-selected')) {
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

      {/* Tree Edit Modal */}
      {isEditingTree && editingTree && (
        <>
          {/* Modal Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
            onClick={() => {
              if (!isSaving) {
                setIsEditingTree(false);
                setEditingTree(null);
                setShowDeleteConfirm(false);
              }
            }}
          />

          {/* Modal Content */}
          <div className="fixed inset-y-0 right-0 w-full max-w-md bg-white shadow-2xl z-50 overflow-y-auto">
            <div className="p-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-200">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Edit Tree</h2>
                  <p className="text-sm text-gray-500 mt-1 font-mono">{editingTree.tree_id}</p>
                </div>
                <button
                  onClick={() => {
                    if (!isSaving) {
                      setIsEditingTree(false);
                      setEditingTree(null);
                      setShowDeleteConfirm(false);
                    }
                  }}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                  disabled={isSaving}
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Form Fields */}
              <div className="space-y-4">
                {/* Row ID (Read-only) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Row ID</label>
                  <input
                    type="text"
                    value={editingTree.row_id || ''}
                    disabled
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-600 cursor-not-allowed"
                  />
                </div>

                {/* Position (Read-only) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Position</label>
                  <input
                    type="number"
                    value={editingTree.position || ''}
                    disabled
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-600 cursor-not-allowed"
                  />
                </div>

                {/* Variety */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Variety</label>
                  <input
                    type="text"
                    value={editingTree.variety || ''}
                    onChange={(e) => setEditingTree({ ...editingTree, variety: e.target.value })}
                    placeholder="e.g., Fuji, Gala, Honeycrisp"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    disabled={isSaving}
                  />
                </div>

                {/* Status */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select
                    value={editingTree.status || 'unknown'}
                    onChange={(e) => setEditingTree({ ...editingTree, status: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    disabled={isSaving}
                  >
                    <option value="unknown">Unknown</option>
                    <option value="healthy">Healthy</option>
                    <option value="stressed">Stressed</option>
                    <option value="dead">Dead</option>
                  </select>
                </div>

                {/* Planted Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Planted Date</label>
                  <input
                    type="date"
                    value={editingTree.planted_date ? new Date(editingTree.planted_date).toISOString().split('T')[0] : ''}
                    onChange={(e) => setEditingTree({ ...editingTree, planted_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    disabled={isSaving}
                  />
                </div>

                {/* Age */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Age (years)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={editingTree.age || ''}
                    onChange={(e) => setEditingTree({ ...editingTree, age: parseFloat(e.target.value) || undefined })}
                    placeholder="e.g., 5"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    disabled={isSaving}
                  />
                </div>

                {/* Height */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Height (meters)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={editingTree.height || ''}
                    onChange={(e) => setEditingTree({ ...editingTree, height: parseFloat(e.target.value) || undefined })}
                    placeholder="e.g., 3.5"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    disabled={isSaving}
                  />
                </div>

                {/* Last Pruned */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Last Pruned</label>
                  <input
                    type="date"
                    value={editingTree.last_pruned ? new Date(editingTree.last_pruned).toISOString().split('T')[0] : ''}
                    onChange={(e) => setEditingTree({ ...editingTree, last_pruned: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    disabled={isSaving}
                  />
                </div>

                {/* Last Harvest */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Last Harvest</label>
                  <input
                    type="date"
                    value={editingTree.last_harvest ? new Date(editingTree.last_harvest).toISOString().split('T')[0] : ''}
                    onChange={(e) => setEditingTree({ ...editingTree, last_harvest: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    disabled={isSaving}
                  />
                </div>

                {/* Yield Estimate */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Last Harvest Yield (kg)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={editingTree.yield_estimate || ''}
                    onChange={(e) => setEditingTree({ ...editingTree, yield_estimate: parseFloat(e.target.value) || undefined })}
                    placeholder="e.g., 45.5"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    disabled={isSaving}
                  />
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                  <textarea
                    value={editingTree.notes || ''}
                    onChange={(e) => setEditingTree({ ...editingTree, notes: e.target.value })}
                    placeholder="Add any notes about this tree..."
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
                    disabled={isSaving}
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-6 space-y-3">
                {/* Save Button */}
                <button
                  onClick={handleSaveTree}
                  disabled={isSaving}
                  className="w-full px-4 py-3 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isSaving ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </button>

                {/* Delete Button */}
                {!showDeleteConfirm ? (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={isSaving}
                    className="w-full px-4 py-3 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Delete Tree
                  </button>
                ) : (
                  <div className="bg-red-50 border-2 border-red-600 rounded-lg p-4">
                    <p className="text-sm font-medium text-red-900 mb-3">
                      Delete {editingTree.tree_id}? This cannot be undone.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={handleDeleteTree}
                        disabled={isSaving}
                        className="flex-1 px-4 py-2 bg-red-600 text-white font-medium rounded hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isSaving ? 'Deleting...' : 'Yes, Delete'}
                      </button>
                      <button
                        onClick={() => setShowDeleteConfirm(false)}
                        disabled={isSaving}
                        className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 font-medium rounded hover:bg-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Cancel Button */}
                <button
                  onClick={() => {
                    if (!isSaving) {
                      setIsEditingTree(false);
                      setEditingTree(null);
                      setShowDeleteConfirm(false);
                    }
                  }}
                  disabled={isSaving}
                  className="w-full px-4 py-3 bg-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}