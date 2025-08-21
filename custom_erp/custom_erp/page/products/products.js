frappe.pages['products'].on_page_load = function(wrapper) {
    let page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'Items',
        single_column: true
    });
    $(page.body).append(`
        <div class="row" id="product-cards" style="margin-top: 20px;"></div>
        <div class="row mt-3">
            <div class="col text-center">
                <button class="btn btn-secondary" id="prev-page">Previous</button>
                <span id="page-info" style="margin: 0 15px;">Page 1</span>
                <button class="btn btn-secondary" id="next-page">Next</button>
            </div>
        </div>
    `);


    window.itemtoPOmap = {};
    window.pagesize = 9;
    window.totalproducts = 0;
    window.currentpage = 1;


    loadProducts(window.currentpage);


    document.getElementById("prev-page").addEventListener("click", function() {
        if (window.currentpage > 1) {
            window.currentpage--;
            loadProducts(window.currentpage);
        }
    });


    document.getElementById("next-page").addEventListener("click", function() {
        let maxPage = Math.ceil(window.totalproducts / window.pagesize);
        if (window.currentpage < maxPage) {
            window.currentpage++;
            loadProducts(window.currentpage);
        }
    });
};


function loadProducts(page) {
        fetch(`https://fakestoreapi.in/api/products`)
        .then(response => response.json())
        .then(data => {
            let products = Array.isArray(data) ? data : (data.products || []);
            window.totalproducts = data.total || products.length;
            document.getElementById("page-info").textContent = `Page ${page}`;
            let start = (page - 1) * window.pagesize;
            let sliced = products.slice(start, start + window.pagesize);
            renderCards(sliced);
        })
        .catch(() => {
            frappe.msgprint("Failed to fetch products from the API.");
        });
}


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


        frappe.call({
            method: "custom_erp.items.get_stock_balance",
            args: { item_code: itemcode },
            callback: function(r) {
                let stockBal = r.message;
                if (stockBal <= 0){
                    stockBal = 0;
                }
                let cardHTML = `
                    <div class="card mb-4 shadow-sm">
                        <img src="${product.image}" class="card-img-top" style="height: 300px; object-fit: contain;" alt="${safetitle}">
                        <div class="card-body">
                            <h5 class="card-title">${safetitle}</h5>
                            <p class="card-text">${safedesc.substring(0, 50)}...</p>
                            <h6 class="text-success">₹ ${product.price}</h6>
                            <p class="card-text">Stock Balance : <span id="stock-balance-${itemcode}">${stockBal}</span></p>
                            <div id="btn-section-${itemcode}"></div>
                        </div>
                    </div>
                `;
                const card = document.createElement("div");
                card.className = "col-md-4";
                card.innerHTML = cardHTML;
                container.appendChild(card);


                frappe.call({
                    method: "custom_erp.items.check_item_exists",
                    args: { item_code: itemcode },
                    callback: function(checkRes) {
                        let btnSection = document.getElementById(`btn-section-${itemcode}`);
                        let hasItem = checkRes.message && checkRes.message.exists;


                        frappe.call({
                            method: "custom_erp.items.get_workflow_state",
                            args: { fake_store_order: itemcode },
                            callback: function(wfRes) {
                                const wfMsg = wfRes.message || {};


                                if (wfMsg.status === "po_created") {
                                    btnSection.innerHTML = `
                                        <div class="mb-2">
                                            <span class="badge" style="background: #ededed; color:#444; font-size: 1em; padding: 5px 14px; border-radius:6px;">
                                                ${wfMsg.workflow_state || "PO Created"}
                                            </span>
                                        </div>
                                        <button class="btn btn-secondary" id="add-pr-${itemcode}">Add to Purchase Receipt</button>
                                    `;
                                    window.itemtoPOmap[itemcode] = wfMsg.purchase_order;
                                    document.getElementById(`add-pr-${itemcode}`).onclick = function() {
                                        addPurchaseReceipt(itemcode, btnSection);
                                    };
                                } 
                                else if (wfMsg.status === "completed") {
                                    btnSection.innerHTML = `
                                        <button class="btn btn-success" id="create-po-${itemcode}">Create Purchase Order</button>
                                    `;
                                    document.getElementById(`create-po-${itemcode}`).onclick = function() {
                                        createPurchaseOrder(product, itemcode, btnSection);
                                    };
                                } 
                                else {
                                    if (hasItem) {
                                        btnSection.innerHTML = `
                                            <button class="btn btn-success" id="create-po-${itemcode}">Create Purchase Order</button>
                                        `;
                                        document.getElementById(`create-po-${itemcode}`).onclick = function() {
                                            createPurchaseOrder(product, itemcode, btnSection);
                                        };
                                    } else {
                                        btnSection.innerHTML = `
                                            <button class="btn btn-primary" id="add-stock-${itemcode}">Add Stock</button>
                                        `;
                                        document.getElementById(`add-stock-${itemcode}`).onclick = function() {
                                            addStock(product, itemcode, btnSection);
                                        };
                                    }
                                }
                            }
                        });
                    }
                });
            }
        });
    });
}


function createPurchaseOrder(product, itemcode, btnSection) {
    let d = new frappe.ui.Dialog({
        title: 'Purchase Order',
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
                callback: function(r) {
                    if (r.message && r.message.purchase_order) {
                        frappe.show_alert({ message: `Created Purchase Order: ${r.message.purchase_order}`, indicator: 'green' });
                        btnSection.innerHTML = `
                            <div class="mb-2">
                                <span class="badge" style="background: #ededed; color:#444; font-size: 1em; padding: 5px 14px; border-radius:6px;">PO Created</span>
                            </div>
                            <button class="btn btn-secondary" id="add-pr-${itemcode}">Add to Purchase Receipt</button>
                        `;
                        window.itemtoPOmap[itemcode] = r.message.purchase_order;
                        document.getElementById(`add-pr-${itemcode}`).onclick = function() {
                            addPurchaseReceipt(itemcode, btnSection);
                        };
                        updatebalance(itemcode);
                    } else {
                        frappe.msgprint("Failed to create Purchase Order.");
                    }
                    d.hide();
                }
            });
        }
    });
    d.show();
}

function addStock(product, itemcode, btnSection) {
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
                        btnSection.innerHTML = `
                            <div class="mb-2">
                                <span class="badge" style="background: #ededed; color:#444; font-size: 1em; padding: 5px 14px; border-radius:6px;">PO Created</span>
                            </div>
                            <button class="btn btn-secondary" id="add-pr-${itemcode}">Add Purchase Receipt</button>
                        `;
                        window.itemtoPOmap[itemcode] = response.message.purchase_order;
                        document.getElementById(`add-pr-${itemcode}`).onclick = function() {
                            addPurchaseReceipt(itemcode, btnSection);
                        };
                        updatebalance(itemcode);
                    } else {
                        frappe.msgprint('Failed to add stock.');
                    }
                    d.hide();
                }
            });
        }
    });
    d.show();
}

function addPurchaseReceipt(itemcode, btnSection) {
    const poname = window.itemtoPOmap[itemcode];
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
                    (msg.status === "already_exists" ?
                        "Purchase Receipt exists: " :
                        "Receipt created: ") + msg.purchase_receipt
                );
                btnSection.innerHTML = `
                    <button class="btn btn-success" id="create-po-${itemcode}">Create Purchase Order</button>
                `;
                document.getElementById(`create-po-${itemcode}`).onclick = function() {
                    createPurchaseOrder({}, itemcode, btnSection);
                };
                updatebalance(itemcode);
            } else {
                frappe.msgprint("Failed to create Purchase Receipt.");
            }
                }
    });
}