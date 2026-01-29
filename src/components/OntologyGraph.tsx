import { useEffect, useRef, useCallback } from 'react';
import cytoscape from 'cytoscape';
import type { Core, EventObject } from 'cytoscape';
import { useAppStore } from '../store/appStore';
import { ZoomIn, ZoomOut, Maximize2, RotateCcw } from 'lucide-react';

export function OntologyGraph() {
  const cyRef = useRef<Core | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const {
    currentOntology,
    selectedEntityId,
    selectedRelationshipId,
    highlightedEntities,
    highlightedRelationships,
    selectEntity,
    selectRelationship,
    activeQuest,
    currentStepIndex,
    advanceQuestStep,
    darkMode
  } = useAppStore();
  
  // Theme-aware colors
  const themeColors = darkMode 
    ? { nodeText: '#B3B3B3', edgeColor: '#505050', edgeText: '#808080' }
    : { nodeText: '#2A2A2A', edgeColor: '#888888', edgeText: '#555555' };

  // Build graph elements from ontology
  const buildElements = useCallback(() => {
    const nodes = currentOntology.entityTypes.map(entity => ({
      data: {
        id: entity.id,
        label: `${entity.icon} ${entity.name}`,
        name: entity.name,
        icon: entity.icon,
        color: entity.color,
        description: entity.description,
        type: 'entity'
      }
    }));

    const edges = currentOntology.relationships.map(rel => ({
      data: {
        id: rel.id,
        source: rel.from,
        target: rel.to,
        label: rel.name,
        cardinality: rel.cardinality,
        description: rel.description,
        type: 'relationship'
      }
    }));

    return [...nodes, ...edges];
  }, [currentOntology]);

  // Initialize Cytoscape
  useEffect(() => {
    if (!containerRef.current) return;

    const cy = cytoscape({
      container: containerRef.current,
      elements: buildElements(),
      style: [
        // Base node style
        {
          selector: 'node',
          style: {
            'label': 'data(label)',
            'text-valign': 'bottom',
            'text-halign': 'center',
            'font-size': '14px',
            'font-family': 'Segoe UI, sans-serif',
            'font-weight': 600,
            'color': themeColors.nodeText,
            'text-margin-y': 10,
            'width': 70,
            'height': 70,
            'background-color': 'data(color)',
            'border-width': 3,
            'border-color': 'data(color)',
            'border-opacity': 0.5,
            'transition-property': 'border-width, border-color, width, height',
            'transition-duration': 200
          }
        },
        // Selected node
        {
          selector: 'node:selected',
          style: {
            'border-width': 5,
            'border-color': '#0078D4',
            'width': 85,
            'height': 85
          }
        },
        // Highlighted node
        {
          selector: 'node.highlighted',
          style: {
            'border-width': 4,
            'border-color': '#FFB900',
            'width': 80,
            'height': 80
          }
        },
        // Dimmed node
        {
          selector: 'node.dimmed',
          style: {
            'opacity': 0.3
          }
        },
        // Base edge style
        {
          selector: 'edge',
          style: {
            'label': 'data(label)',
            'font-size': '12px',
            'font-family': 'Segoe UI, sans-serif',
            'color': themeColors.edgeText,
            'text-rotation': 'autorotate',
            'text-margin-y': -10,
            'width': 3,
            'line-color': themeColors.edgeColor,
            'target-arrow-color': themeColors.edgeColor,
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'transition-property': 'width, line-color, target-arrow-color',
            'transition-duration': 200
          }
        },
        // Selected edge
        {
          selector: 'edge:selected',
          style: {
            'width': 5,
            'line-color': '#0078D4',
            'target-arrow-color': '#0078D4',
            'color': '#0078D4'
          }
        },
        // Highlighted edge
        {
          selector: 'edge.highlighted',
          style: {
            'width': 4,
            'line-color': '#FFB900',
            'target-arrow-color': '#FFB900',
            'color': '#FFB900'
          }
        },
        // Dimmed edge
        {
          selector: 'edge.dimmed',
          style: {
            'opacity': 0.2
          }
        }
      ],
      layout: {
        name: 'cose',
        idealEdgeLength: () => 180,
        nodeOverlap: 40,
        refresh: 20,
        fit: true,
        padding: 60,
        randomize: false,
        componentSpacing: 120,
        nodeRepulsion: () => 8000,
        edgeElasticity: () => 100,
        nestingFactor: 5,
        gravity: 80,
        numIter: 1000,
        coolingFactor: 0.95,
        minTemp: 1.0
      },
      minZoom: 0.3,
      maxZoom: 3,
      wheelSensitivity: 0.3
    });

    // Event handlers
    cy.on('tap', 'node', (evt: EventObject) => {
      const nodeId = evt.target.id();
      selectEntity(nodeId);
      
      // Check if this advances a quest step
      if (activeQuest) {
        const currentStep = activeQuest.steps[currentStepIndex];
        if (currentStep.targetType === 'entity' && currentStep.targetId === nodeId) {
          advanceQuestStep();
        }
      }
    });

    cy.on('tap', 'edge', (evt: EventObject) => {
      const edgeId = evt.target.id();
      selectRelationship(edgeId);
      
      // Check if this advances a quest step
      if (activeQuest) {
        const currentStep = activeQuest.steps[currentStepIndex];
        if (currentStep.targetType === 'relationship' && currentStep.targetId === edgeId) {
          advanceQuestStep();
        }
      }
    });

    cy.on('tap', (evt: EventObject) => {
      if (evt.target === cy) {
        selectEntity(null);
        selectRelationship(null);
      }
    });

    cyRef.current = cy;

    return () => {
      cy.destroy();
    };
  }, [buildElements, selectEntity, selectRelationship, activeQuest, currentStepIndex, advanceQuestStep, darkMode, themeColors]);

  // Handle selection changes
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    cy.elements().removeClass('highlighted dimmed');
    cy.elements().unselect();

    if (selectedEntityId) {
      const node = cy.getElementById(selectedEntityId);
      node.select();
      
      // Highlight connected edges and nodes
      const connectedEdges = node.connectedEdges();
      const connectedNodes = connectedEdges.connectedNodes();
      
      cy.elements().addClass('dimmed');
      node.removeClass('dimmed');
      connectedEdges.removeClass('dimmed');
      connectedNodes.removeClass('dimmed');
    }

    if (selectedRelationshipId) {
      const edge = cy.getElementById(selectedRelationshipId);
      edge.select();
      
      const connectedNodes = edge.connectedNodes();
      
      cy.elements().addClass('dimmed');
      edge.removeClass('dimmed');
      connectedNodes.removeClass('dimmed');
    }
  }, [selectedEntityId, selectedRelationshipId]);

  // Handle highlights from queries
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    cy.elements().removeClass('highlighted');

    highlightedEntities.forEach(id => {
      cy.getElementById(id).addClass('highlighted');
    });

    highlightedRelationships.forEach(id => {
      cy.getElementById(id).addClass('highlighted');
    });
  }, [highlightedEntities, highlightedRelationships]);

  // Graph controls
  const handleZoomIn = () => {
    const cy = cyRef.current;
    if (cy) {
      cy.zoom(cy.zoom() * 1.3);
      cy.center();
    }
  };

  const handleZoomOut = () => {
    const cy = cyRef.current;
    if (cy) {
      cy.zoom(cy.zoom() / 1.3);
      cy.center();
    }
  };

  const handleFit = () => {
    const cy = cyRef.current;
    if (cy) {
      cy.fit(undefined, 60);
    }
  };

  const handleReset = () => {
    const cy = cyRef.current;
    if (cy) {
      cy.layout({
        name: 'cose',
        idealEdgeLength: () => 180,
        nodeOverlap: 40,
        fit: true,
        padding: 60,
        nodeRepulsion: () => 8000
      }).run();
    }
  };

  return (
    <div className="graph-container">
      <div ref={containerRef} className="graph-canvas" />
      
      <div className="graph-controls">
        <button className="graph-control-btn" onClick={handleZoomIn} title="Zoom In">
          <ZoomIn size={18} />
        </button>
        <button className="graph-control-btn" onClick={handleZoomOut} title="Zoom Out">
          <ZoomOut size={18} />
        </button>
        <button className="graph-control-btn" onClick={handleFit} title="Fit to View">
          <Maximize2 size={18} />
        </button>
        <button className="graph-control-btn" onClick={handleReset} title="Reset Layout">
          <RotateCcw size={18} />
        </button>
      </div>

      <div className="graph-legend">
        <div className="legend-title">Entity Types</div>
        {currentOntology.entityTypes.map(entity => (
          <div key={entity.id} className="legend-item">
            <div className="legend-dot" style={{ backgroundColor: entity.color }} />
            <span>{entity.icon} {entity.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
