sap.ui.define([
    "sap/ui/model/type/String",
    "sap/ui/model/ValidateException"
], (StringType, ValidateException) => {
    "use strict";

    // name@domain.tld: no spaces, one "@", a domain with at least one dot and a TLD of 2+ letters
    const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[A-Za-z]{2,}$/

    // E-mail field: keeps the String constraints (maxLength) and rejects values that are not an e-mail address.
    // Empty is accepted (the required-field validation is separate). formatOptions.invalidText: message of the error
    return StringType.extend("braskem.zui5vetting.model.EmailType", {
        parseValue(sValue, sSourceType) {
            return StringType.prototype.parseValue.call(this, (sValue ?? "").trim(), sSourceType)
        },

        validateValue(sValue) {
            StringType.prototype.validateValue.call(this, sValue)
            if (sValue && !EMAIL.test(sValue)) {
                throw new ValidateException(this.oFormatOptions.invalidText || "Invalid e-mail address")
            }
        }
    });
});
