sap.ui.define([
    "sap/ui/model/json/JSONModel",
    "sap/ui/Device"
], 
function (JSONModel, Device) {
    "use strict";

    /**
     * Reads the message returned by the Gateway (JSON or XML body), falling back to the HTTP status.
     * @param {object} oResponse response of a failed OData request
     * @returns {string} message for the user, empty when nothing could be read
     */
    function extractODataErrorMessage(oResponse) {
        if (!oResponse) {
            return "";
        }

        const sBody = oResponse.body ?? oResponse.responseText
        if (typeof sBody === "string" && sBody.trim()) {
            try {
                const oError = JSON.parse(sBody).error
                const aDetails = (oError?.innererror?.errordetails || []).map((oDetail) => oDetail?.message).filter(Boolean)
                if (oError?.message?.value) {
                    return oError.message.value
                }
                if (aDetails.length) {
                    return aDetails.join("\n")
                }
            } catch {
                const aMatch = sBody.match(/<message[^>]*>([^<]*)<\/message>/)
                if (aMatch) {
                    return aMatch[1]
                }
            }
        }

        if (oResponse.statusText) {
            return oResponse.statusText + (oResponse.statusCode ? ` (${oResponse.statusCode})` : "")
        }
        return ""
    }

    return {
        /**
         * Provides runtime information for the device the UI5 app is running on as a JSONModel.
         * @returns {sap.ui.model.json.JSONModel} The device model.
         */
        createDeviceModel: function () {
            var oModel = new JSONModel(Device);
            oModel.setDefaultBindingMode("OneWay");
            return oModel;
        },

        /**
         * Sends every failed request of the OData model to the app messages (Component#addMessage).
         * @param {sap.ui.model.odata.v2.ODataModel} oModel OData model
         * @param {sap.ui.core.UIComponent} oComponent app component
         */
        attachErrorHandling: function (oModel, oComponent) {
            const oBundle = oComponent.getModel("i18n").getResourceBundle()

            oModel.attachMetadataFailed((oEvent) => {
                oComponent.addMessage({
                    type: "Error",
                    title: oBundle.getText("messages.metadataFailed"),
                    description: extractODataErrorMessage(oEvent.getParameter("response"))
                })
            })

            oModel.attachRequestFailed((oEvent) => {
                const oResponse = oEvent.getParameter("response")
                // statusCode 0 = request aborted (e.g. navigation), not a real error
                if (!oResponse || Number(oResponse.statusCode) === 0) {
                    return
                }
                oComponent.addMessage({
                    type: "Error",
                    title: oBundle.getText("messages.requestFailed", [oResponse.statusCode || "?"]),
                    description: extractODataErrorMessage(oResponse) || oBundle.getText("messages.genericError")
                })
            })
        }
    };

});
