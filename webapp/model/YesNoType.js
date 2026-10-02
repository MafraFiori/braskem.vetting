sap.ui.define([
    "sap/ui/model/SimpleType"
], (SimpleType) => {
    "use strict";

    // Maps an Edm.Boolean to the Yes/No RadioButtonGroup index: true = 0 (Yes), false = 1 (No), empty = -1
    return SimpleType.extend("braskem.zui5vetting.model.YesNoType", {
        formatValue(vValue) {
            if (vValue === true) {
                return 0
            }
            return vValue === false ? 1 : -1
        },

        parseValue(iIndex) {
            if (iIndex === 0) {
                return true
            }
            return iIndex === 1 ? false : null
        },

        validateValue() {}
    });
});
