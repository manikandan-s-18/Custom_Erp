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
    renderCart();

    function renderCart() {
        let tbody = document.querySelector("#cart-table tbody");
        tbody.innerHTML = "";

        if (window.cart.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="text-muted text-center">No items added</td></tr>`;
            return;
        }

        let total = 0;
        window.cart.forEach((item, idx) => {
            let itemTotal = item.qty * item.rate;
            total += itemTotal;
            tbody.innerHTML += `
                <tr>
                    <td class="fw-bold">${item.item_name}</td>
                    <td>₹${item.rate}</td>
                    <td>
                        <div class="d-flex align-items-center justify-content-center">
                            <button class="btn btn-sm btn-outline-secondary cart-minus" data-idx="${idx}">−</button>
                            <span class="mx-2 fw-semibold">${item.qty}</span>
                            <button class="btn btn-sm btn-outline-secondary cart-plus" data-idx="${idx}">+</button>
                        </div>
                    </td>
                    <td>₹${itemTotal}</td>
                    <td>
                        <button class="btn btn-sm btn-outline-danger cart-remove" data-idx="${idx}">✕</button>
                    </td>
                </tr>`;
        });

        tbody.innerHTML += `
            <tr>
                <td colspan="3" class="text-end fw-bold">Total</td>
                <td class="fw-bold">₹${total}</td>
                <td></td>
            </tr>
        `;

        $(".cart-minus").off('click').on('click', function() {
            let idx = $(this).data("idx");
            if (window.cart[idx].qty > 1) window.cart[idx].qty -= 1;
            renderCart();
        });
        $(".cart-plus").off('click').on('click', function() {
            let idx = $(this).data("idx");
            window.cart[idx].qty += 1;
            renderCart();
        });
        $(".cart-remove").off('click').on('click', function() {
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
                    <img src="${product.image}" 
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
                let idx = window.cart.findIndex(c => c.item_code === product.name);
                if (idx >= 0) window.cart[idx].qty += 1;
                else window.cart.push({ item_code: product.name, item_name: product.item_name, rate: product.valuation_rate, qty: 1 });
                renderCart();
            });
            container.appendChild(card);
        });
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
                if (r.message && r.message.success) {
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
            callback: function(r) {
                if (r.message) {
                    let html = `
                        <h5 class="fw-bold mb-2">Sales Orders</h5>
                        <div class="table-responsive">
                            <table class='table table-sm table-hover table-bordered'>
                                <thead class="table-light">
                                    <tr><th>ID</th><th>Customer</th><th>Status</th><th>Total</th><th>Actions</th></tr>
                                </thead><tbody>`;

                    r.message.forEach(so => {
                        html += `<tr>
                            <td>${so.name}</td>
                            <td>${so.customer}</td>
                            <td><h5 style="color: orange;">${so.status}</h5></td>
                            <td>₹${so.grand_total}</td>
                            <td>`;

                        if (!so.has_invoice) {
                            html += `<button class="btn btn-xs btn-info create-invoice" data-id="${so.name}">Invoice</button> `;

                        } else {
                            so.invoice_status.forEach(inv => {
                                if (["Overdue", "Partly Paid", "Unpaid"].includes(inv.status)) {

                                    html += `<button class="btn btn-xs btn-success make-payment" data-id="${so.name}" data-invoice="${inv.name}">Payment</button>`;
                                } else {

                                    html += `<h5 class="text-success fw-bold">${inv.status}</h5>`;
                                }
                            });
                        }
                        if (!so.has_delivery_note && so.has_invoice) {
                            
                            html += ` <button class="btn btn-xs btn-warning create-dn" data-id="${so.name}">Delivery</button>`;
                        }

                        html += `</tr>`;
                    });

                    html += `</tbody></table></div>`;
                    $("#sales-orders-list").html(html);

                    $(".create-invoice").on("click", function() {
                        createDocument('invoice', $(this).data("id"));
                    });

                    $(".create-dn").on("click", function() {
                        createDocument('delivery', $(this).data("id"));
                    });

                    $(".make-payment").on("click", function() {
                        makePayment($(this).data("id"), $(this).data("invoice"));
                    });
                }
            }
        });
    }

    function createDocument(type, salesOrderId) {
        let method = type === 'invoice' ? 'create_sales_invoice' : 'create_delivery_note';
        frappe.call({
            method: `custom_erp.pos.${method}`,
            args: { sales_order: salesOrderId },
            callback: function(r) {
                if (r.message && r.message.success) {
                    frappe.show_alert({ message: `${type === 'invoice' ? 'Invoice' : 'Delivery Note'} created`, indicator: 'green' });
                    loadSalesOrders();
                } else {
                    frappe.msgprint(r.message ? r.message.error : `Failed to create ${type}`);
                }
            }
        });
    }

    function makePayment(salesOrderId, invoiceId = null) {
        frappe.call({
            method: "custom_erp.pos.get_payment_info",
            args: { sales_order_id: salesOrderId, invoice_id: invoiceId },
            callback: function(r) {
                if (r.message && r.message.success) {
                    showPaymentDialog(r.message, salesOrderId, invoiceId);
                } else {
                    frappe.msgprint(r.message ? r.message.error : "Failed to get payment info");
                }
            }
        });
    }

    function showPaymentDialog(info, salesOrderId, invoiceId) {
        const dialog = new frappe.ui.Dialog({
            title: `${invoiceId ? 'Invoice Payment' : 'Advance Payment'} - ${salesOrderId}`,
            fields: [
                {
                    fieldtype: 'Link',
                    label: 'Mode of Payment',
                    fieldname: 'mode_of_payment',
                    options: 'Mode of Payment',
                    reqd: 1
                },
                {
                    fieldtype: 'Currency',
                    label: 'Amount',
                    fieldname: 'amount',
                    default: info.outstanding,
                    reqd: 1
                },
                {
                    fieldtype: 'Data',
                    label: 'Reference No',
                    fieldname: 'reference_no'
                }
            ],
            primary_action_label: 'Submit Payment',
            primary_action: function(values) {
                if (values.amount <= 0 || values.amount > info.outstanding) {
                    frappe.msgprint(`Amount must be between ₹1 and ₹${info.outstanding}`);
                    return;
                }

                frappe.call({
                    method: "custom_erp.pos.create_payment",
                    args: {
                        sales_order_id: salesOrderId,
                        invoice_id: invoiceId,
                        mode_of_payment: values.mode_of_payment,
                        amount: values.amount,
                        reference_no: values.reference_no
                    },
                    callback: function(r) {
                        if (r.message && r.message.success) {
                            frappe.show_alert({ message: "Payment recorded successfully", indicator: 'green' });
                            dialog.hide();
                            loadSalesOrders();
                        } else {
                            frappe.msgprint(r.message ? r.message.error : "Payment failed");
                        }
                    }
                });
            }
        });
        dialog.show();
    }
}