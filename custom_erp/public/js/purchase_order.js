frappe.ui.form.on('Purchase Invoice', {
    custom_most_purchased_item: function(frm) {   
        if (!frm.doc.supplier) {
            frappe.msgprint(__('Please select a supplier first.'));
            return;
        }
        frappe.call({
            method: 'custom_erp.api.get_most_purchased_items',
            args: { supplier: frm.doc.supplier },
            callback: function(r) {
                if (r.message) {
                    frm.clear_table('items');
                    r.message.forEach(item => {
                        let row = frm.add_child('items', {
                            item_code: item.item_code,
                            item_name: item.item_name,
                            qty: item.qty || 1,
                            rate: item.rate,
                            uom: item.uom || 'Nos'
                        });
                    });
                    frm.refresh_field('items');
                } else {
                    frappe.msgprint(__('No items found for this supplier.'));
                }
            }
        });
    }
});
