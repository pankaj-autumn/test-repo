class CartRemoveButton extends HTMLElement {
  constructor() {
    super();

    this.addEventListener('click', (event) => {
      event.preventDefault();
      const cartItems = this.closest('cart-items') || this.closest('cart-drawer-items');
      cartItems.updateQuantity(this.dataset.index, 0);
    });
  }
}

customElements.define('cart-remove-button', CartRemoveButton);

class CartItems extends HTMLElement {
  constructor() {
    super();
    this.lineItemStatusElement = document.getElementById('shopping-cart-line-item-status') || document.getElementById('CartDrawer-LineItemStatus');

    const debouncedOnChange = debounce((event) => {
      this.onChange(event);
    }, ON_CHANGE_DEBOUNCE_TIMER);

    this.addEventListener('change', debouncedOnChange.bind(this));
  }

  cartUpdateUnsubscriber = undefined;

  connectedCallback() {
    this.cartUpdateUnsubscriber = subscribe(PUB_SUB_EVENTS.cartUpdate, (event) => {
      if (event.source === 'cart-items') {
        return;
      }
      this.onCartUpdate();
    });
  }

  disconnectedCallback() {
    if (this.cartUpdateUnsubscriber) {
      this.cartUpdateUnsubscriber();
    }
  }

  onChange(event) {
    this.updateQuantity(event.target.dataset.index, event.target.value, document.activeElement.getAttribute('name'));
  }

  onCartUpdate() {
    fetch(`${routes.cart_url}?section_id=main-cart-items`)
      .then((response) => response.text())
      .then((responseText) => {
        const html = new DOMParser().parseFromString(responseText, 'text/html');
        const sourceQty = html.querySelector('cart-items');
        this.innerHTML = sourceQty.innerHTML;
      })
      .catch(e => {
        console.error(e);
      });
  }

  getSectionsToRender() {
    return [
      {
        id: 'main-cart-items',
        section: document.getElementById('main-cart-items').dataset.id,
        selector: '.js-contents'
      },
      {
        id: 'cart-icon-bubble',
        section: 'cart-icon-bubble',
        selector: '.shopify-section'
      },
      {
        id: 'cart-live-region-text',
        section: 'cart-live-region-text',
        selector: '.shopify-section'
      },
      {
        id: 'main-cart-footer',
        section: document.getElementById('main-cart-footer').dataset.id,
        selector: '.js-contents'
      }
    ];
  }

  updateQuantity(line, quantity, name) {
    this.enableLoading(line);

    const body = JSON.stringify({
      line,
      quantity,
      sections: this.getSectionsToRender().map((section) => section.section),
      sections_url: window.location.pathname
    });

    fetch(`${routes.cart_change_url}`, { ...fetchConfig(), ...{ body } })
      .then((response) => {
        return response.text();
      })
      .then((state) => {
        const parsedState = JSON.parse(state);
        const quantityElement = document.getElementById(`Quantity-${line}`) || document.getElementById(`Drawer-quantity-${line}`);
        const items = document.querySelectorAll('.cart-item');

        if (parsedState.errors) {
          quantityElement.value = quantityElement.getAttribute('value');
          this.updateLiveRegions(line, parsedState.errors);
          return;
        }

        this.classList.toggle('is-empty', parsedState.item_count === 0);
        const cartDrawerWrapper = document.querySelector('cart-drawer');
        const cartFooter = document.getElementById('main-cart-footer');

        if (cartFooter) cartFooter.classList.toggle('is-empty', parsedState.item_count === 0);
        if (cartDrawerWrapper) cartDrawerWrapper.classList.toggle('is-empty', parsedState.item_count === 0);

        this.getSectionsToRender().forEach((section => {
          const elementToReplace =
            document.getElementById(section.id).querySelector(section.selector) || document.getElementById(section.id);
          elementToReplace.innerHTML =
            this.getSectionInnerHTML(parsedState.sections[section.section], section.selector);
        }));
        const updatedValue = parsedState.items[line - 1] ? parsedState.items[line - 1].quantity : undefined;
        let message = '';
        if (items.length === parsedState.items.length && updatedValue !== parseInt(quantityElement.value)) {
          if (typeof updatedValue === 'undefined') {
            message = window.cartStrings.error;
          } else {
            message = window.cartStrings.quantityError.replace('[quantity]', updatedValue);
          }
        }
        this.updateLiveRegions(line, message);

        const lineItem = document.getElementById(`CartItem-${line}`) || document.getElementById(`CartDrawer-Item-${line}`);
        if (lineItem && lineItem.querySelector(`[name="${name}"]`)) {
          cartDrawerWrapper ? trapFocus(cartDrawerWrapper, lineItem.querySelector(`[name="${name}"]`)) : lineItem.querySelector(`[name="${name}"]`).focus();
        } else if (parsedState.item_count === 0 && cartDrawerWrapper) {
          trapFocus(cartDrawerWrapper.querySelector('.drawer__inner-empty'), cartDrawerWrapper.querySelector('a'))
        } else if (document.querySelector('.cart-item') && cartDrawerWrapper) {
          trapFocus(cartDrawerWrapper, document.querySelector('.cart-item__name'))
        }
        publish(PUB_SUB_EVENTS.cartUpdate, {source: 'cart-items'});
      }).catch(() => {
        this.querySelectorAll('.loading-overlay').forEach((overlay) => overlay.classList.add('hidden'));
        const errors = document.getElementById('cart-errors') || document.getElementById('CartDrawer-CartErrors');
        errors.textContent = window.cartStrings.error;
      })
      .finally(() => {
        this.disableLoading(line);
      });
  }

  updateLiveRegions(line, message) {
    const lineItemError = document.getElementById(`Line-item-error-${line}`) || document.getElementById(`CartDrawer-LineItemError-${line}`);
    if (lineItemError) lineItemError.querySelector('.cart-item__error-text').innerHTML = message;

    this.lineItemStatusElement.setAttribute('aria-hidden', true);

    const cartStatus = document.getElementById('cart-live-region-text') || document.getElementById('CartDrawer-LiveRegionText');
    cartStatus.setAttribute('aria-hidden', false);

    setTimeout(() => {
      cartStatus.setAttribute('aria-hidden', true);
    }, 1000);
  }

  getSectionInnerHTML(html, selector) {
    return new DOMParser()
      .parseFromString(html, 'text/html')
      .querySelector(selector).innerHTML;
  }

  enableLoading(line) {
    const mainCartItems = document.getElementById('main-cart-items') || document.getElementById('CartDrawer-CartItems');
    mainCartItems.classList.add('cart__items--disabled');

    const cartItemElements = this.querySelectorAll(`#CartItem-${line} .loading-overlay`);
    const cartDrawerItemElements = this.querySelectorAll(`#CartDrawer-Item-${line} .loading-overlay`);

    [...cartItemElements, ...cartDrawerItemElements].forEach((overlay) => overlay.classList.remove('hidden'));

    document.activeElement.blur();
    this.lineItemStatusElement.setAttribute('aria-hidden', false);
  }

  disableLoading(line) {
    const mainCartItems = document.getElementById('main-cart-items') || document.getElementById('CartDrawer-CartItems');
    mainCartItems.classList.remove('cart__items--disabled');

    const cartItemElements = this.querySelectorAll(`#CartItem-${line} .loading-overlay`);
    const cartDrawerItemElements = this.querySelectorAll(`#CartDrawer-Item-${line} .loading-overlay`);

    cartItemElements.forEach((overlay) => overlay.classList.add('hidden'));
    cartDrawerItemElements.forEach((overlay) => overlay.classList.add('hidden'));
  }
}

customElements.define('cart-items', CartItems);

if (!customElements.get('cart-note')) {
  customElements.define('cart-note', class CartNote extends HTMLElement {
      constructor() {
        super();

      this.addEventListener('change', debounce((event) => {
            const body = JSON.stringify({ note: event.target.value });
            fetch(`${routes.cart_update_url}`, { ...fetchConfig(), ...{ body } });
      }, ON_CHANGE_DEBOUNCE_TIMER))
      }
  });
};

// --- AUTO-REMOVE BUNDLED PRODUCTS ON PARENT REMOVAL ---
window.isCleaningCart = false;

function getCartSectionsToRender() {
  const sections = [];
  const mainCartItems = document.getElementById('main-cart-items');
  const cartDrawer = document.getElementById('CartDrawer');
  
  if (mainCartItems) {
    sections.push({
      id: 'main-cart-items',
      section: mainCartItems.dataset.id || 'main-cart-items',
      selector: '.js-contents'
    });
    const mainCartFooter = document.getElementById('main-cart-footer');
    if (mainCartFooter) {
      sections.push({
        id: 'main-cart-footer',
        section: mainCartFooter.dataset.id || 'main-cart-footer',
        selector: '.js-contents'
      });
    }
    sections.push({
      id: 'cart-live-region-text',
      section: 'cart-live-region-text',
      selector: '.shopify-section'
    });
  }
  
  if (cartDrawer) {
    sections.push({
      id: 'CartDrawer',
      section: 'cart-drawer',
      selector: '.drawer__inner'
    });
  }
  
  sections.push({
    id: 'cart-icon-bubble',
    section: 'cart-icon-bubble',
    selector: '.shopify-section'
  });
  
  return sections;
}

function renderCartSections(parsedState, sections) {
  sections.forEach((section) => {
    const elementToReplace =
      document.getElementById(section.id)?.querySelector(section.selector) || document.getElementById(section.id);
    if (elementToReplace && parsedState.sections?.[section.section]) {
      const html = new DOMParser().parseFromString(parsedState.sections[section.section], 'text/html');
      const innerContent = html.querySelector(section.selector)?.innerHTML || html.body.innerHTML;
      elementToReplace.innerHTML = innerContent;
    }
  });
}

subscribe(PUB_SUB_EVENTS.cartUpdate, async (event) => {
  if (window.isCleaningCart) return;

  try {
    const cartResponse = await fetch(routes.cart_url || '/cart.js');
    if (!cartResponse.ok) return;
    const cart = await cartResponse.json();

    // 1. Group active parent bundle IDs
    const activeParents = new Set();
    cart.items.forEach(item => {
      if (item.properties && item.properties._bundle_id && item.properties._is_parent === 'true') {
        activeParents.add(item.properties._bundle_id);
      }
    });

    // 2. Identify orphans
    const orphans = [];
    cart.items.forEach(item => {
      if (item.properties && item.properties._bundle_id) {
        if (!activeParents.has(item.properties._bundle_id)) {
          orphans.push(item);
        }
      }
    });

    if (orphans.length === 0) return;

    // Orphans found! Let's lock execution and delete them
    window.isCleaningCart = true;

    const updates = {};
    orphans.forEach(item => {
      updates[item.key] = 0; // Use the unique line item key
    });

    const sectionsToRender = getCartSectionsToRender();
    const updateResponse = await fetch(routes.cart_update_url || '/cart/update.js', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        updates: updates,
        sections: sectionsToRender.map(s => s.section),
        sections_url: window.location.pathname
      })
    });

    if (updateResponse.ok) {
      const parsedState = await updateResponse.json();
      renderCartSections(parsedState, sectionsToRender);

      // Update general visibility states (e.g. toggling empty states)
      const mainCartItems = document.querySelector('cart-items');
      if (mainCartItems) mainCartItems.classList.toggle('is-empty', parsedState.item_count === 0);

      const cartDrawerWrapper = document.querySelector('cart-drawer');
      if (cartDrawerWrapper) cartDrawerWrapper.classList.toggle('is-empty', parsedState.item_count === 0);

      const cartFooter = document.getElementById('main-cart-footer');
      if (cartFooter) cartFooter.classList.toggle('is-empty', parsedState.item_count === 0);

      // Re-trigger event for other subscribers
      publish(PUB_SUB_EVENTS.cartUpdate, { source: 'bundle-cleanup' });
    }
  } catch (error) {
    console.error('Bundle cleanup failed:', error);
  } finally {
    window.isCleaningCart = false;
  }
});
