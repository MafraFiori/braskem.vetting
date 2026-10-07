sap.ui.define([
    "./Base.controller",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator"
], (Controller, Filter, FilterOperator) => {
    "use strict";

    // Only the questionnaires created through this app. In QAS the destination uses the fixed technical user SVC_BTP,
    // so every record created by the app has this owner. In PRD the records belong to the logged-in user: adjust before going live
    const OWNER_FILTER = new Filter("LoginOwner", FilterOperator.EQ, "SVC_BTP")

    return Controller.extend("braskem.zui5vetting.controller.Welcome", {

        onInit() {
            this.getRouter().getRoute("RouteWelcome").attachPatternMatched(this._onWelcomeMatched, this)
            this.attachMessages()
        },

        onExit() {
            this.detachMessages()
        },

        _onWelcomeMatched() {
            const oSmartTable = this.byId("smartTable")
            if (oSmartTable.isInitialised()) {
                // Forced: the filters did not change, but a questionnaire may have been saved
                oSmartTable.rebindTable(true)
            }
        },

        // The RFC behind QuestionnairesSet ignores $orderby: the list is loaded once and sorted / filtered in the browser.
        // The owner filter is added on every load, together with the filters of the filter bar, and is not shown to the user
        onBeforeRebindTable(oEvent) {
            const oBindingParams = oEvent.getParameter("bindingParams")
            oBindingParams.parameters = { ...oBindingParams.parameters, operationMode: "Client" }
            this._toUtcDateFilters(oBindingParams.filters)
            oBindingParams.filters.push(OWNER_FILTER)
        },

        // DtQuest is a date saved as UTC midnight (Edm.DateTime without display-format Date). The dates chosen in the
        // filter bar are local (in Brazil midnight = 03:00 UTC), so they are moved to the same calendar day in UTC
        _toUtcDateFilters(aFilters) {
            const toUtc = (vValue, bEndOfDay) => (vValue instanceof Date
                ? new Date(Date.UTC(vValue.getFullYear(), vValue.getMonth(), vValue.getDate(),
                    ...(bEndOfDay ? [23, 59, 59, 999] : [0, 0, 0, 0])))
                : vValue)

            aFilters.forEach((oFilter) => {
                if (oFilter.aFilters) {
                    this._toUtcDateFilters(oFilter.aFilters)
                } else if (oFilter.sPath === "DtQuest") {
                    oFilter.oValue1 = toUtc(oFilter.oValue1, oFilter.sOperator === "LE")
                    oFilter.oValue2 = toUtc(oFilter.oValue2, true)
                }
            })
        },

        onRefreshPage(oEvent) {
            let SmartTable = this.getView().byId("smartTable")
            SmartTable.rebindTable(true)
        },

        onCreateQuestionnaires(oEvent) {
            this.getRouter().navTo("RouteCreateQuestionnaires")
        },

        onDisplayQuestionnaire(oEvent) {
            this._navToQuestionnaire(oEvent, "display")
        },

        onEditQuestionnaire(oEvent) {
            this._navToQuestionnaire(oEvent, "edit")
        },

        onCopyQuestionnaire(oEvent) {
            this._navToQuestionnaire(oEvent, "copy")
        },

        // Translated status text (i18n "status.<code>"); unknown codes show the backend description
        formatStatusText(sStatus, sDescription) {
            const sKey = `status.${sStatus}`
            const oBundle = this.getOwnerComponent().getModel("i18n").getResourceBundle()
            return oBundle.hasText(sKey) ? oBundle.getText(sKey) : (sDescription || sStatus || "")
        },

        _navToQuestionnaire(oEvent, sMode) {
            const sIdQuest = oEvent.getSource().getBindingContext().getProperty("IdQuest")
            this.getRouter().navTo("RouteQuestionnaire", { IdQuest: sIdQuest, mode: sMode })
        }

    });
});