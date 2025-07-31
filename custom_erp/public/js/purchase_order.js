frappe.ui.form.on('Purchase Invoice', {
    // fetch from the supplier
    refresh: function(frm) {
        if(!frm.doc.docstatus == 0) return;
        if (frm.doc.supplier) {
            frm.add_custom_button(__('Fetch Now'), function () {
                console.log("Fetching supplier items...");
                frappe.call({
                    method: 'custom_erp.api.fetch_supplier_items',
                    args: { supplier: frm.doc.supplier },
                    callback: function(r) {
                        if (r.message && r.message.length > 0) {
                            frm.clear_table('items');
                            r.message.forEach(item => {
                                frm.add_child('items', {
                                    item_code: item.item_code,
                                    item_name: item.item_name,
                                    qty: item.qty || 1,
                                    rate: item.rate, 
                                    uom: item.uom || 'Nos'           
                                });
                            });
                            frm.refresh_field('items');
                            console.log("Items fetched and added to the form.");
                        } else {
                            frappe.msgprint(__('No items found for this supplier.'));
                        }
                    }
                });
            });
        
    
}},

//fetch most purchased items
    custom_most_purchased_item: function(frm) {
        if (frm.doc.docstatus === 0) {
        if (!frm.doc.supplier) {
            frappe.msgprint(__('Please select a supplier first.'));
            return;
        }

        frappe.call({
            method: 'custom_erp.api.get_most_purchased_items',
            args: { supplier: frm.doc.supplier },
            callback: function(r) {
                if (r.message && r.message.length > 0) {
                    frm.clear_table('items');
                    r.message.forEach(item => {
                        frm.add_child('items', {
                            item_code: item.item_code,
                            item_name: item.item_name,
                            qty: item.total_qty || 1,
                            rate: item.rate,
                            uom: item.uom || 'Nos'
                        });
                    });
                    frm.refresh_field('items');
                } else {
                    frappe.msgprint(__('No purchased items found for this supplier.'));
                }
            }
        });
    }
}
}
);
