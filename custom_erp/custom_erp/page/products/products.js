frappe.pages['products'].on_page_load = function(wrapper) {
    let page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'Items',
        single_column: true
    });

    $(page.body).append(`<div class="row" id="product-cards" style="margin-top: 20px;"></div>`);
    window.itemtoPOmap = {};

    fetch("https://fakestoreapi.in/api/products?limit=150")
        .then(response => response.json())
        .then(data => {
            let products = Array.isArray(data) ? data : (data.products || []);
            if (products.length > 0) {
                renderCards(products);
            } else {
                frappe.msgprint("No products found.");
            }
        })
        .catch(() => {
            frappe.msgprint("Failed to fetch products from the API.");
        });
};


function getItemCode(product) {
    return `FS-${product.id}`;
}

function updatebalance(itemcode) {
    frappe.call({
        method: "custom_erp.items.get_stock_balance",
        args: { item_code: itemcode },
        callback: function(r) {
            const stockbalance = document.getElementById(`stock-balance-${itemcode}`);
            if (stockbalance) {
                stockbalance.textContent = r.message || 0;
            }
        }
    });
}

function renderCards(products) {
    const container = document.getElementById("product-cards");
    container.innerHTML = "";
    products.forEach(product => {
        const safetitle = frappe.utils.escape_html(product.title || "");
        const safedesc = frappe.utils.escape_html(product.description || "");
        const itemcode = getItemCode(product);

        const card = document.createElement("div");
        card.className = "col-md-4";

        card.innerHTML = `
            <div class="card mb-4 shadow-sm">
                <img src="${product.image}" class="card-img-top" style="height: 300px; object-fit: contain;" alt="${safetitle}">
                <div class="card-body">
                    <h5 class="card-title">${safetitle}</h5>
                    <p class="card-text">${safedesc.substring(0, 50)}...</p>
                    <h6 class="text-success">₹ ${product.price}</h6>
                    <p class="card-text">Stock Balance : <span id="stock-balance-${itemcode}">loading...</span></p>
                    <button class="btn btn-primary" id="add-stock-${itemcode}" onclick='addStock(${JSON.stringify(product)})'>Add Stock</button>
                    <div id="pr-section-${itemcode}" style="display:none;">
                        <select class="form-control mb-2" id="workflow-state-${itemcode}" disabled></select>
                        <button class="btn btn-secondary" onclick='addPurchaseReceipt("${itemcode}")'>Add Purchase Receipt</button>
                    </div>
                </div>
            </div>
        `;
        container.appendChild(card);


        frappe.call({
            method: "custom_erp.items.get_workflow_state",
            args: { fake_store_order: itemcode },
            callback: function(r) {
                if (r.message) {
                    if (r.message.status === "completed") {
                        document.getElementById(`add-stock-${itemcode}`).style.display = "inline-block";
                        document.getElementById(`pr-section-${itemcode}`).style.display = "none";
                    } else if (r.message.status === "po_created") {
                        document.getElementById(`add-stock-${itemcode}`).style.display = "none";
                        const prsection = document.getElementById(`pr-section-${itemcode}`);
                        const workflowSelect = document.getElementById(`workflow-state-${itemcode}`);
                        if (prsection && workflowSelect) {
                            workflowSelect.innerHTML = `<option>${r.message.workflow_state}</option>`;
                            prsection.style.display = "block";
                            window.itemtoPOmap[itemcode] = r.message.purchase_order;
                        }
                    }
                }
            }
        });


        frappe.call({
            method: "custom_erp.items.get_stock_balance",
            args: { item_code: itemcode },
            callback: function(r) {
                const stockbalance = document.getElementById(`stock-balance-${itemcode}`);
                if (stockbalance) {
                    stockbalance.textContent = r.message || 0;
                }
            }
        });
    });
}

function addStock(product) {
    if (typeof product === "string") product = JSON.parse(product);
    const itemcode = getItemCode(product);

    let d = new frappe.ui.Dialog({
        title: 'Add Stock',
        fields: [
            { fieldname: 'item_code', label: 'Item Code', fieldtype: 'Data', default: itemcode, read_only: 1 },
            { fieldname: 'item_name', label: 'Item Name', fieldtype: 'Data', default: product.title, read_only: 1 },
            { fieldname: 'target_warehouse', label: 'Target Warehouse', fieldtype: 'Link', options: 'Warehouse', reqd: 1 },
            { fieldname: 'required_date', label: 'Required Date', fieldtype: 'Date', reqd: 1 },
            { fieldname: 'quantity', label: 'Quantity', fieldtype: 'Float', reqd: 1 },
            { fieldname: 'price', label: 'Price', fieldtype: 'Currency', default: product.price, read_only: 1 }
        ],
        primary_action_label: 'Submit',
        primary_action(values) {
            frappe.call({
                method: 'custom_erp.items.add_stock',
                args: {
                    item_code: values.item_code,
                    title: values.item_name,
                    price: values.price,
                    image: product.image,
                    quantity: values.quantity,
                    required_date: values.required_date,
                    target_warehouse: values.target_warehouse
                },
                callback: function(response) {
                    if (response.message && response.message.purchase_order) {
                        frappe.show_alert({ message: `Stock added for ${values.item_name}`, indicator: 'green' });
                        document.getElementById(`add-stock-${itemcode}`).style.display = "none";
                        const prsection = document.getElementById(`pr-section-${itemcode}`);
                        const workflowSelect = document.getElementById(`workflow-state-${itemcode}`);
                        if (prsection && workflowSelect) {
                            workflowSelect.innerHTML = `<option>${response.message.workflow_state || 'Pending'}</option>`;
                            prsection.style.display = "block";
                        }
                        window.itemtoPOmap[itemcode] = response.message.purchase_order;
                    } else {
                        frappe.msgprint('Failed to add stock.');
                    }
                    d.hide();
                    updatebalance(itemcode); 
                }
            });
        }
    });
    d.show();
}

function addPurchaseReceipt(item_code) {
    const poname = window.itemtoPOmap[item_code];
    if (!poname) {
        frappe.msgprint("Purchase Order not found.");
        return;
    }

    frappe.call({
        method: 'custom_erp.items.add_purchase_receipt',
        args: { purchase_order: poname },
        callback: function(r) {
            let msg = r.message;
            if (msg && msg.purchase_receipt) {
                frappe.msgprint(
                    (msg.status === "already_exists" ? "Purchase Receipt exists: " : "Receipt created: ") + msg.purchase_receipt
                );
                document.getElementById(`pr-section-${item_code}`).style.display = "none";
                document.getElementById(`add-stock-${item_code}`).style.display = "inline-block";
                updatebalance(item_code); 
            } else {
                frappe.msgprint("Failed to create Purchase Receipt.");
            }
        }
    });
}
