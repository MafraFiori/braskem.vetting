sap.ui.define([], () => {
    "use strict";

    // Questionnaire status (StVettQuest, domain values): criticality + icon shown in the list
    // (the translated text is formatted by the controller, it needs the i18n bundle)
    const STATUS = {
        "01": { state: "None", icon: "sap-icon://edit" },             // Em Edição
        "02": { state: "Information", icon: "sap-icon://paper-plane" }, // Enviado
        "03": { state: "Warning", icon: "sap-icon://pending" },        // Em análise
        "04": { state: "Success", icon: "sap-icon://accept" },         // Aprovado
        "05": { state: "Error", icon: "sap-icon://decline" }           // Rejeitado
    }

    return {
        statusState(sStatus) {
            return STATUS[sStatus]?.state ?? "None"
        },

        statusIcon(sStatus) {
            return STATUS[sStatus]?.icon ?? ""
        }
    };
});
