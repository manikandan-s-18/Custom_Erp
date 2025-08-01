frappe.pages['products'].on_page_load = function(wrapper) {
    let page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'Items',
        single_column: true
    });

    $(page.body).append(`<div class="row" id="product-cards" style="margin-top: 20px;"></div>`);


    frappe.call({
        method: 'custom_erp.items.get_existing_item_codes',
        callback: function(r) {
            const existingItemCodes = r.message || [];
            fetchProducts(existingItemCodes);
        }
    });
};

function fetchProducts(existingItemCodes) {
    fetch("https://fakestoreapi.in/api/products?limit=150")
        .then(response => response.json())
        .then(data => {
            if (data.status === "SUCCESS" && Array.isArray(data.products)) {
                renderCards(data.products, existingItemCodes);
            } else {
                frappe.msgprint("No products found.");
            }
        })
        .catch(error => {
            console.error("API fetch error:", error);
            frappe.msgprint("Failed to fetch products from the API.");
        });
}

function renderCards(products, existingItemCodes) {
    const container = document.getElementById("product-cards");
    container.innerHTML = "";

    products.forEach(product => {
        const alreadyExists = existingItemCodes.includes(String(product.id));

        const card = document.createElement("div");
        card.className = "col-md-4";

        const safeTitle = product.title.replace(/'/g, "\\'");
        const safeDesc = product.description.replace(/'/g, "\\'");

        card.innerHTML = `
            <div class="card mb-4 shadow-sm">
                <img src="${product.image}" class="card-img-top" style="height: 300px; object-fit: contain;" alt="${safeTitle}">
                <div class="card-body">
                    <h5 class="card-title">${safeTitle}</h5>
                    <p class="card-text">${safeDesc.substring(0, 100)}...</p>
                    <h6 class="text-success">₹ ${product.price}</h6>
                    ${
                        alreadyExists
                        ? `<span class="text-muted">Already Added</span>`
                        : `<button class="btn btn-primary btn-sm" onclick='addToCart(this, ${JSON.stringify({
                            id: product.id,
                            title: safeTitle,
                            price: product.price,
                            description: safeDesc,
                            image: product.image,
                            category: product.category
                        }).replace(/'/g, "&apos;")})'>Add to Items</button>`
                    }
                </div>
            </div>
        `;

        container.appendChild(card);
    });
}

function addToCart(button, product) {
    frappe.call({
        method: 'custom_erp.items.add_to_cart',
        args: {
            product_id: product.id,
            title: product.title,
            price: product.price,
            description: product.description,
            image: product.image,
            category: product.category
        },
        callback: function(response) {
            const res = response.message;
            if (res.status === "SUCCESS") {
                frappe.msgprint(res.message);
                if (button) {
                    button.outerHTML = `<span class="text-muted">Added</span>`;
                }
            } else {
                frappe.msgprint(res.message || "Something went wrong.");
            }
        }
    });
}
