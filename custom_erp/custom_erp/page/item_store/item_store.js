frappe.pages['item-store'].on_page_load = function(wrapper) {
    let page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'Item Store',
        single_column: true
    });

    $(page.body).append(`
        <div class="row">

            <div class="col-md-7">
                <div class="row g-3" id="product-cards" style="margin-top:10px;"></div>
            </div>
            <div class="col-md-5" 
                 style="border-left:2px solid #e0e0e0ff;position:sticky;top:0;height:100vh;overflow-y:auto;padding:15px;">
                
                <!-- Cart -->
                <h4 class="fw-bold mb-3">Your Cart</h4>
                <table class="table table-bordered table-sm align-middle" id="cart-table">
                    <tbody></tbody>
                </table>
                <div class="d-grid gap-2">
                    <button class="btn btn-dark" id="checkout-btn">Checkout</button>
                    <button class="btn btn-success" id="show-orders">View Sales Orders</button>
                </div>

                <div id="sales-orders-list" class="mt-4"></div>
            </div>
        </div>
    `);

    window.cart = [];
    loadProducts();

    function renderCart() {
        let tbody = document.querySelector("#cart-table tbody");
        tbody.innerHTML = "";

        if (window.cart.length === 0) {
            tbody.innerHTML = `<tr><td colspan="3" class="text-muted text-center">No items added</td></tr>`;
            return;
        }

        window.cart.forEach((item, idx) => {
            tbody.innerHTML += `
                <tr>
                    <td class="fw-bold">${item.item_name}</td>
                    <td>
                        <div class="d-flex align-items-center justify-content-center">
                            <button class="btn btn-sm btn-outline-secondary cart-minus" data-idx="${idx}">−</button>
                            <span class="mx-2 fw-semibold">${item.qty}</span>
                            <button class="btn btn-sm btn-outline-secondary cart-plus" data-idx="${idx}">+</button>
                        </div>
                    </td>
                    <td>
                        <button class="btn btn-sm btn-outline-danger cart-remove" data-idx="${idx}">✕</button>
                    </td>
                </tr>`;
        });

        $(".cart-minus").click(function() {
            let idx = $(this).data("idx");
            if (window.cart[idx].qty > 1) window.cart[idx].qty -= 1;
            renderCart();
        });
        $(".cart-plus").click(function() {
            let idx = $(this).data("idx");
            window.cart[idx].qty += 1;
            renderCart();
        });
        $(".cart-remove").click(function() {
            let idx = $(this).data("idx");
            window.cart.splice(idx, 1);
            renderCart();
        });
    }

    function loadProducts() {
        frappe.call({
            method: "frappe.client.get_list",
            args: {
                doctype: "Item",
                fields: ["name", "item_name", "description", "image", "valuation_rate"],
                limit_page_length: 100
            },
            callback: function(r) {
                if (r.message) renderCards(r.message);
                else frappe.msgprint("No items found.");
            }
        });
    }

    function renderCards(products) {
        const container = document.getElementById("product-cards");
        container.innerHTML = "";

        products.forEach(product => {
            let card = document.createElement("div");
            card.className = "col-sm-6 col-lg-4"; 
            card.innerHTML = `
                <div class="card h-100 shadow-sm border-0 rounded-3">
                    <img src="${product.image || "/assets/frappe/images/no-image.jpg"}" 
                         class="card-img-top p-3" 
                         style="height:180px;object-fit:contain;background:#fafafa;border-radius:10px;">
                    <div class="card-body d-flex flex-column">
                        <h6 class="card-title text-truncate fw-bold">${frappe.utils.escape_html(product.item_name || "")}</h6>
                        <p class="card-text small text-muted" style="flex-grow:1;">
                            ${frappe.utils.escape_html(product.description || "").substring(0,60)}...
                        </p>
                        <h6 class="text-success mt-2 mb-3">₹ ${product.valuation_rate || 0}</h6>
                        <button class="btn btn-primary add-to-cart mt-auto w-100">Add to Cart</button>
                    </div>
                </div>`;

            card.querySelector(".add-to-cart").addEventListener("click", function() {
                addToCart(product.name, product.item_name, product.valuation_rate);
            });
            container.appendChild(card);
        });
    }

    function addToCart(item_code, item_name, rate) {
        let idx = window.cart.findIndex(c => c.item_code === item_code);
        if (idx >= 0) window.cart[idx].qty += 1;
        else window.cart.push({ item_code, item_name, rate, qty: 1 });
        renderCart();
    }

    $("#checkout-btn").on("click", function() {
        if (window.cart.length === 0) {
            frappe.msgprint("Your cart is empty!");
            return;
        }
        frappe.call({
            method: "custom_erp.pos.create_sales_order",
            args: { cart_items: window.cart },
            callback: function(r) {
                if (r.message) {
                    frappe.show_alert({ message: `Sales Order ${r.message.name} created`, indicator: 'green' });
                    window.cart = [];
                    renderCart();
                    loadSalesOrders();
                }
            }
        });
    });

    $("#show-orders").on("click", function() {
        loadSalesOrders();
    });

    function loadSalesOrders() {
        frappe.call({
            method: "custom_erp.pos.get_sales_orders",
            args: { limit: 20 },
            callback: function(r) {
                if (r.message) {
                    let html = `
                        <h5 class="fw-bold mb-2">Sales Orders</h5>
                        <div class="table-responsive">
                        <table class='table table-sm table-hover table-bordered align-middle'>
                            <thead class="table-light">
                                <tr>
                                    <th>ID</th><th>Customer</th><th>Status</th><th>Total</th><th>Actions</th>
                                </tr>
                            </thead><tbody>`;
                    
                    r.message.forEach(so => {
                        html += `<tr>
                            <td class="fw-semibold">${so.name}</td>
                            <td>${so.customer}</td>
                            <td><span class="badge bg-info">${so.status}</span></td>
                            <td>₹${so.grand_total}</td>
                            <td class="d-flex gap-1">`;

                        if ((so.status === "To Deliver and Bill" || so.workflow_state === "To Invoice") && !so.has_invoice) {
                            html += `<button class="btn btn-sm btn-info create-invoice" data-id="${so.name}">Invoice</button>`;
                        } 
                        else if (so.status === "To Deliver" && !so.has_dn) {
                            html += `<button class="btn btn-sm btn-warning create-dn" data-id="${so.name}">Delivery</button>`;
                        }
                        else  {
                            html += `<span class="badge bg-success">Delivered</span>`;
                        }
                        
                        html += `</td></tr>`;
                    });

                    html += "</tbody></table></div>";
                    $("#sales-orders-list").html(html);

                    $(".create-invoice").click(function() {
                        let so = $(this).data("id");
                        frappe.call({
                            method: "custom_erp.pos.create_sales_invoice",
                            args: { sales_order: so },
                            callback: function(r) {
                                if (r.message) {
                                    frappe.show_alert({ message: `Invoice ${r.message.name} created`, indicator: 'green' });
                                    loadSalesOrders(); 
                                }
                            }
                        });
                    });

                    $(".create-dn").click(function() {
                        let so = $(this).data("id");
                        frappe.call({
                            method: "custom_erp.pos.create_delivery_note",
                            args: { sales_order: so },
                            callback: function(r) {
                                if (r.message) {
                                    frappe.show_alert({ message: `Delivery Note ${r.message.name} created`, indicator: 'green' });
                                    loadSalesOrders(); 
                                }
                            }
                        });
                    });
                }
            }
        });
    }
};
