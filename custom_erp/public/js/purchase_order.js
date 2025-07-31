frappe.ui.form.on('Purchase Invoice', {
    // Fetch items from the supplier on refresh
    refresh: function(frm) {
        if (frm.doc.docstatus !== 0) return;

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
                                const row = frm.add_child('items');
                                frappe.model.set_value(row.doctype, row.name, 'item_code', item.item_code);
                            });
                            console.log("Items fetched and added to the form.");
                        } else {
                            frappe.msgprint(__('No items found for this supplier.'));
                        }
                    }
                });
            });
        }
    },

 // Fetch most purchased items
    custom_most_purchased_item: function(frm) {
        if (frm.doc.docstatus !== 0) return;
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
                            const row = frm.add_child('items');
                            frappe.model.set_value(row.doctype, row.name, 'item_code', item.item_code);
                        });
                    } else {
                        frappe.msgprint(__('No purchased items found for this supplier.'));
                    }
                }
            });
        }
    
});
