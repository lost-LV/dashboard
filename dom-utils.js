// dom-utils.js
// Utility functions for DOM manipulation and optimization

// Create a global variable to track when DOM utilities are ready
window.domUtilsReady = false;

(function() {
    // Cache DOM elements to avoid repeated querySelector calls
    const domCache = {};

    // DOM element creation with attributes and event listeners
    function createElement(tag, attributes = {}, eventListeners = {}, children = []) {
        const element = document.createElement(tag);

        // Set attributes
        for (const [key, value] of Object.entries(attributes)) {
            if (key === 'style' && typeof value === 'object') {
                Object.assign(element.style, value);
            } else if (key === 'className') {
                element.className = value;
            } else if (key === 'innerHTML') {
                element.innerHTML = value;
            } else {
                element.setAttribute(key, value);
            }
        }

        // Add event listeners
        for (const [event, handler] of Object.entries(eventListeners)) {
            element.addEventListener(event, handler);
        }

        // Append children
        for (const child of children) {
            if (typeof child === 'string') {
                element.appendChild(document.createTextNode(child));
            } else if (child instanceof Node) {
                element.appendChild(child);
            }
        }

        return element;
    }

    // Get or create cached DOM element
    function getElement(selector, parent = document) {
        if (!domCache[selector]) {
            domCache[selector] = parent.querySelector(selector);
        }
        return domCache[selector];
    }

    // Get or create cached DOM elements
    function getElements(selector, parent = document) {
        const cacheKey = `${selector}-all`;
        if (!domCache[cacheKey]) {
            domCache[cacheKey] = Array.from(parent.querySelectorAll(selector));
        }
        return domCache[cacheKey];
    }

    // Clear cache for specific selector or all if not provided
    function clearCache(selector) {
        if (selector) {
            delete domCache[selector];
            delete domCache[`${selector}-all`];
        } else {
            for (const key in domCache) {
                delete domCache[key];
            }
        }
    }

    // Create a button with standard styling
    function createButton(text, options = {}) {
        const defaultStyle = {
            position: 'absolute',
            padding: '5px',
            fontSize: '10px',
            backgroundColor: '#2196F3',
            color: '#ffffff',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
            zIndex: '1000',
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
            transition: 'background-color 0.2s, transform 0.1s'
        };

        const style = { ...defaultStyle, ...options.style };

        const defaultEvents = {
            mouseenter: (e) => { e.target.style.backgroundColor = '#0b7dda'; },
            mouseleave: (e) => { e.target.style.backgroundColor = style.backgroundColor; },
            mousedown: (e) => { e.target.style.transform = 'scale(0.95)'; },
            mouseup: (e) => { e.target.style.transform = 'scale(1)'; }
        };

        const events = { ...defaultEvents, ...options.events };

        return createElement('button',
            { textContent: text, style: style },
            events
        );
    }

    // Create a toggle button
    function createToggleButton(text, options = {}) {
        const button = createButton(text, options);

        let isActive = options.isActive !== undefined ? options.isActive : true;

        // Update button appearance based on state
        const updateAppearance = () => {
            button.style.opacity = isActive ? '1' : '0.6';
        };

        // Initialize appearance
        updateAppearance();

        // Add toggle functionality
        const originalClick = options.events && options.events.click ? options.events.click : null;

        button.addEventListener('click', (e) => {
            isActive = !isActive;
            updateAppearance();

            if (originalClick) {
                originalClick(e, isActive);
            }

            if (options.onToggle) {
                options.onToggle(isActive);
            }

            // Save state if storage key is provided
            if (options.storageKey) {
                localStorage.setItem(options.storageKey, isActive);
            }
        });

        // Expose toggle state and methods
        button.isActive = isActive;
        button.setActive = (active) => {
            isActive = active;
            updateAppearance();
        };

        return button;
    }

    // Batch DOM updates to minimize reflows
    function batchDOMUpdates(updateFn) {
        return new Promise(resolve => {
            requestAnimationFrame(() => {
                const result = updateFn();
                resolve(result);
            });
        });
    }

    // Debounce function for DOM events
    function debounce(fn, delay) {
        let timeoutId;
        return function(...args) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                fn.apply(this, args);
            }, delay);
        };
    }

    // Throttle function for DOM events
    function throttle(fn, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                fn.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    // Create a notification that auto-dismisses
    function showNotification(message, duration = 2000) {
        const notification = createElement('div', {
            style: {
                position: 'fixed',
                bottom: '20px',
                right: '20px',
                backgroundColor: 'rgba(33, 150, 243, 0.9)',
                color: 'white',
                padding: '10px 15px',
                borderRadius: '4px',
                boxShadow: '0 2px 10px rgba(0, 0, 0, 0.2)',
                zIndex: '10000',
                opacity: '0',
                transition: 'opacity 0.3s ease'
            },
            textContent: message
        });

        document.body.appendChild(notification);

        // Trigger reflow to ensure transition works
        notification.offsetHeight;
        notification.style.opacity = '1';

        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, duration);
    }

    // Export functions to global scope
    window.domUtils = {
        createElement,
        getElement,
        getElements,
        clearCache,
        createButton,
        createToggleButton,
        batchDOMUpdates,
        debounce,
        throttle,
        showNotification
    };

    // Set the ready flag
    window.domUtilsReady = true;

    // Dispatch an event to notify that DOM utilities are ready
    document.dispatchEvent(new CustomEvent('domUtilsReady'));
})();
