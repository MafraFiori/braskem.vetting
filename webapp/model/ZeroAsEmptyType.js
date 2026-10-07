sap.ui.define([
    "sap/ui/model/type/String"
], (StringType) => {
    "use strict";

    // NUMC fields of the backend come back as "00" / "000" when they were never filled.
    // Shows them as empty (a Select key "00" does not exist in the domain values; for a number 0 and empty are the same in NUMC).
    // Only the displayed value changes: the model keeps the backend value until the user changes the field.
    return StringType.extend("braskem.zui5vetting.model.ZeroAsEmptyType", {
        formatValue(sValue, sTargetType) {
            return StringType.prototype.formatValue.call(this, /^0+$/.test(sValue ?? "") ? "" : sValue, sTargetType)
        }
    });
});
