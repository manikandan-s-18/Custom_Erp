frappe.ui.form.on("Purchase Invoice", {
    before_save: async function(frm) {
        if (!frm.doc.supplier || !frm.doc.items.length) {
            frappe.validated = false;
            return;
        }

        let missing_items = [];

        for (let row of frm.doc.items) {
            const res = await frappe.call({
                method: "custom_erp.customizations.supplier_item_validation.check_supplier_item",
                args: {
                    supplier: frm.doc.supplier,
                    item_code: row.item_code
                }
            });

            if (res.message!==true) {
                missing_items.push(row.item_code);
            }
        }

        if (missing_items.length) {
            await new Promise((resolve) => {
                frappe.confirm(
                    `These items are not linked to the supplier:<br><b>${missing_items.join(", ")}</b><br><br>Add them and continue?`,
                    async () => {
                        for (let item_code of missing_items) {
                            await frappe.call({
                                method: "custom_erp.customizations.supplier_item_validation.add_supplier_item",
                                args: {
                                    supplier: frm.doc.supplier,
                                    item_code: item_code
                                }
                            });
                        }
                        frappe.show_alert("Items added.");
                        resolve(); 
                    },
                    () => {
                        frappe.validated = true;
                        resolve(); 
                    }
                );
            });
        }
    }
});
