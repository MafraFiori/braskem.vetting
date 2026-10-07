sap.ui.define([
    "sap/base/Log",
    "sap/ui/model/odata/type/Decimal",
    "braskem/zui5vetting/model/ZeroAsEmptyType"
], (Log, Decimal, ZeroAsEmptyType) => {
    "use strict";

    // Formats of the form fields taken from the service metadata, so the screen follows the backend
    // (lengths, precision and scale) without hard-coding them in the view:
    // - Edm.String  -> maxLength on Input/TextArea; on Select it is kept to be checked before saving
    //                  Selects and digit-only inputs show NUMC "00"/"000" as empty (ZeroAsEmptyType)
    // - Edm.Decimal -> odata Decimal type with the precision/scale of the property (e.g. 6,3 = up to 3 integer digits)

    function getProperty(oMetaModel, sEntitySet, sProperty) {
        const oEntitySet = oMetaModel.getODataEntitySet(sEntitySet)
        const oEntityType = oEntitySet && oMetaModel.getODataEntityType(oEntitySet.entityType)
        return oEntityType && oMetaModel.getODataProperty(oEntityType, sProperty)
    }

    function applyToField(oField, oPart, oProperty) {
        const iMaxLength = parseInt(oProperty.maxLength, 10)

        if (oProperty.type === "Edm.String" && iMaxLength) {
            if (oField.isA("sap.m.Select")) {
                oField.data("maxLength", iMaxLength)
                oField.bindProperty("selectedKey", { path: oPart.path, model: oPart.model, type: new ZeroAsEmptyType() })
                return
            }
            oField.setMaxLength(iMaxLength)
            if (oField.getType?.() === "Number") {
                // Number inputs ignore maxLength: text input that accepts digits only
                oField.setType("Text")
                oField.bindProperty("value", {
                    path: oPart.path,
                    model: oPart.model,
                    type: new ZeroAsEmptyType({}, { maxLength: iMaxLength, search: "^[0-9]*$" })
                })
            }
        } else if (oProperty.type === "Edm.Decimal") {
            // Text input: the Decimal type formats with the user's locale (decimal comma), which a Number input rejects
            oField.setType?.("Text")
            oField.bindProperty("value", {
                path: oPart.path,
                model: oPart.model,
                type: new Decimal({}, {
                    precision: parseInt(oProperty.precision, 10),
                    scale: parseInt(oProperty.scale, 10) || 0
                })
            })
        }
    }

    return {
        /**
         * Applies the metadata formats to the Input/TextArea/Select of the view bound to the given models.
         * Bindings that already have a type (dates, Yes/No) are kept.
         * @param {sap.ui.core.mvc.View} oView view with the form
         * @param {sap.ui.model.odata.v2.ODataModel} oModel OData model
         * @param {Object<string, string>} mEntitySets model name -> entity set, e.g. { q1: "Questionnaires_1Set" }
         * @returns {Promise} resolved when the formats were applied
         */
        apply(oView, oModel, mEntitySets) {
            const oMetaModel = oModel.getMetaModel()

            return oMetaModel.loaded().then(() => {
                oView.findAggregatedObjects(true, (oControl) => oControl.isA(["sap.m.Input", "sap.m.TextArea", "sap.m.Select"]))
                    .forEach((oField) => {
                        const oInfo = oField.getBindingInfo(oField.isA("sap.m.Select") ? "selectedKey" : "value")
                        const oPart = oInfo?.parts?.[0]
                        if (!oPart || oInfo.type || !mEntitySets[oPart.model]) {
                            return
                        }

                        const oProperty = getProperty(oMetaModel, mEntitySets[oPart.model], oPart.path)
                        if (oProperty) {
                            applyToField(oField, oPart, oProperty)
                        } else {
                            Log.warning(`Property ${oPart.path} not found in ${mEntitySets[oPart.model]}`, null, "braskem.zui5vetting")
                        }
                    })
            })
        }
    };
});
