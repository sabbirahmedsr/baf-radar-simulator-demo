/**
 * Module: app.js
 *
 * This is the main entry point for the application's front-end logic.
 * It handles view routing (SPA), dynamic content loading, and initialization
 * of various UI components and modals.
 */
import { Diorama } from './ui/diorama.js';
import { init3DScenes } from './ui/diorama-3d.js';

// Simple SPA router
document.addEventListener('DOMContentLoaded', () => {
  const navLinks = document.querySelectorAll('.nav-link');
  const views = document.querySelectorAll('.view');

  const loadView = async (viewId) => {
    const viewElement = document.getElementById(viewId);
    // Only fetch content if the view is empty
    if (viewElement && viewElement.innerHTML.trim() === '') {
      try {
        const response = await fetch(`view/${viewId}.html`);
          if (!response.ok) throw new Error(`Could not load ${viewId}.html`);
          const content = await response.text();
          viewElement.innerHTML = content;

          if (viewId === 'diorama-view') {
            setupDioramaInteractiveDemo();
            setupDioramaModalListeners();
            init3DScenes();
          } else if (viewId === 'resource-view') {
            await populateResourceGrid();
            setupModalListeners(); // Set up listeners for the newly created resource cards
          } else if (viewId === 'simulator-view') {
            // Dynamically import the main simulator script.
            // This ensures the radarCanvas and other elements are in the DOM
            // before the Simulation class tries to access them.
            // The main.js script will then self-initialize the Simulation.
            await import('./main.js');
          }            
      } catch (error) {
        console.error('Failed to load view:', error);
        viewElement.innerHTML = `<p style="color: red;">Error loading content.</p>`;
      }
    }
  };

  const setupDioramaInteractiveDemo = () => {
    // This function is now just a simple initializer.
    const canvas = document.getElementById('diorama-canvas');
    const slider = document.getElementById('diorama-slider');
    const scenarioRadios = document.querySelectorAll('input[name="scenario"]');
    new Diorama(canvas, slider, scenarioRadios);
  };

  const setupDioramaModalListeners = () => {
    document.querySelectorAll('[data-enlargeable]').forEach(item => {
      item.addEventListener('click', () => {
        const modal = document.getElementById('resource-modal');
        const modalContent = modal.querySelector('.modal-content');
        
        // Populate modal for image-only view
        document.getElementById('modal-img').src = item.dataset.imageSrc;
        
        // Add a class to hide text elements
        modalContent.classList.add('image-only');
        
        // Show modal
        modal.style.display = 'flex';
      });
    });
  };

  const populateResourceGrid = async () => {
    const gridElement = document.querySelector('#resource-view .resource-grid');
    if (!gridElement) {
        console.error('Resource grid container not found.');
        return;
    }

    try {
        const response = await fetch('data/resource.md');
        if (!response.ok) throw new Error('Could not load data/resource.md');
        const mdContent = await response.text();

        const resources = mdContent.split(/\r?\n---\r?\n/).map(block => {
            if (block.trim() === '') return null;
            const imageMatch = block.match(/!\[.*?\]\((.*?)\)/);
            const titleMatch = block.match(/### (.*?)\s*?\n/);
            const urlMatch = block.match(/#### (.*?)\s*?\n/);
            const shortMatch = block.match(/###### (.*?)\s*?\n/);
            const longMatch = block.match(/###### .*?\s*?\n\n*([\s\S]+)/);
            return { image: imageMatch?.[1] || '', title: titleMatch?.[1] || 'No Title', url: urlMatch?.[1]?.trim() || '#', short: shortMatch?.[1]?.trim() || '', long: longMatch?.[1]?.trim() || '' };
        }).filter(Boolean);

        const gridHtml = resources.map(res => `
          <div class="resource-item" 
               data-modal-image="${res.image}"
               data-modal-title="${res.title}"
               data-external-url="${res.url}"
               data-modal-description="${res.long.replace(/"/g, '&quot;')}">
            <div class="resource-image-container"><img src="${res.image}" alt="${res.title}"></div>
            <div class="resource-content"><h3>${res.title}</h3><p>${res.short}</p></div>
          </div>
        `).join('');

        gridElement.innerHTML = gridHtml;
    } catch (error) {
        console.error('Failed to populate resource grid:', error);
        gridElement.innerHTML = `<p style="color: red;">Error loading resources.</p>`;
    }
  };

  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const targetViewId = link.getAttribute('data-view');

      loadView(targetViewId).then(() => {
        views.forEach(view => view.classList.remove('active'));
        navLinks.forEach(navLink => navLink.classList.remove('active'));
        link.classList.add('active');
        document.getElementById(targetViewId).classList.add('active');
        window.history.pushState({}, '', link.href);
      });
    });
  });

  // Load the initial view based on the active link.
  const activeLink = document.querySelector('.nav-link.active');
  if (activeLink) {
    const activeViewId = activeLink.getAttribute('data-view');
    loadView(activeViewId);
  }

  // --- Modal Logic ---
  const modal = document.getElementById('resource-modal');
  const modalClose = document.querySelector('.modal-close');

  function setupModalListeners() {
    document.querySelectorAll('.resource-item').forEach(item => {
      item.addEventListener('click', () => {
        document.getElementById('modal-img').src = item.dataset.modalImage;
        document.getElementById('modal-title').textContent = item.dataset.modalTitle;
        document.getElementById('modal-description').textContent = item.dataset.modalDescription;
        document.getElementById('modal-external-link').href = item.dataset.externalUrl;
        modal.querySelector('.modal-content').classList.remove('image-only');
        modal.style.display = 'flex';
      });
    });
  }

  function closeModal() {
    modal.style.display = 'none';
  }

  modalClose.addEventListener('click', closeModal);

  window.addEventListener('click', (event) => {
    if (event.target === modal) {
      closeModal();
    }
  });
});