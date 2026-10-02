sap.ui.define([
    "./Base.controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/ui/core/EventBus"
], (BaseController, JSONModel, MessageBox, MessageToast, EventBus) => {
    "use strict";

    // The form reads two entities: q1> = Questionnaires_1Set (sections 1-6), q2> = Questionnaires_2Set (sections 7-13)
    // Each one has its own deferred group, because Questionnaires_2 can only be sent after the backend generates the IdQuest
    const ENTITIES = {
        // IdQuest is a placeholder, the backend replaces it with the generated number
        q1: { path: "/Questionnaires_1Set", groupId: "questionnaire1", properties: { IdQuest: "000000", Quest216: "NA" } },
        q2: { path: "/Questionnaires_2Set", groupId: "questionnaire2", properties: {} }
    }

    // StatusQuest values
    const STATUS = {
        DRAFT: "01",        // Em Edição
        SUBMITTED: "02"     // Enviado
    }

    // Controls checked by the required-field validation
    const FIELD_TYPES = ["sap.m.InputBase", "sap.m.Select", "sap.m.RadioButtonGroup"]

    return BaseController.extend("braskem.zui5vetting.controller.Questionnaire", {

        onInit() {
            const oView = this.getView()
            const oModel = this.getOwnerComponent().getModel()

            // UI-only state, without a field in the entities
            oView.setModel(new JSONModel({ q5_2NotApplicable: false }), "form")

            oModel.setDeferredGroups([...oModel.getDeferredGroups(), ...Object.values(ENTITIES).map((oEntity) => oEntity.groupId)])
            // Same ODataModel under two names, so each entity has its own binding context on the view
            Object.keys(ENTITIES).forEach((sName) => oView.setModel(oModel, sName))

            // Opens the MessageView whenever a new message arrives (OData errors, save errors)
            EventBus.getInstance().subscribe("messages", "added", this.openMessageDialog, this)

            this._mContexts = {}
            this.getRouter().getRoute("RouteCreateQuestionnaires").attachPatternMatched(this.newObject, this)
        },

        onExit() {
            EventBus.getInstance().unsubscribe("messages", "added", this.openMessageDialog, this)
        },

        newObject() {
            const oView = this.getView()
            const oModel = this.getOwnerComponent().getModel()

            oView.getModel("form").setData({ q5_2NotApplicable: false })

            oModel.metadataLoaded().then(() => {
                Object.entries(ENTITIES).forEach(([sName, oEntity]) => {
                    if (this._mContexts[sName]?.isTransient()) {
                        oModel.deleteCreatedEntry(this._mContexts[sName])
                    }
                    this._mContexts[sName] = oModel.createEntry(oEntity.path, {
                        groupId: oEntity.groupId,
                        properties: { ...oEntity.properties }
                    })
                    oView.setBindingContext(this._mContexts[sName], sName)
                })
            })
        },

        onSaveDraft() {
            return this._save(STATUS.DRAFT)
        },

        onSaveSubmit() {
            if (!this._validateRequiredFields()) {
                return
            }
            return this._save(STATUS.SUBMITTED)
        },

        // Questionnaires_1 first (it generates the IdQuest on create), then Questionnaires_2 with that IdQuest.
        // After the first save both records exist, so the next saves send only the changes (MERGE)
        async _save(sStatus) {
            const oView = this.getView()
            const oModel = this.getOwnerComponent().getModel()
            const { q1: oContext1, q2: oContext2 } = this._mContexts

            oView.setBusy(true)
            try {
                oModel.setProperty("StatusQuest", sStatus, oContext1)
                await this._submitEntity("q1")
                const sIdQuest = oContext1.getProperty("IdQuest")

                if (oContext2.isTransient()) {
                    oModel.setProperty("IdQuest", sIdQuest, oContext2)
                }
                await this._submitEntity("q2")

                if (sStatus === STATUS.DRAFT) {
                    MessageToast.show(this.getText("questionnaire.msg.draftSaved", [sIdQuest]))
                } else {
                    MessageBox.success(this.getText("questionnaire.msg.saveSuccess", [sIdQuest]), {
                        onClose: () => this.navTo("RouteWelcome")
                    })
                }
            } catch (oError) {
                // Failed OData requests are already added by the requestFailed handler (models.attachErrorHandling)
                if (!oError?.response && !oError?.statusCode) {
                    this.addMessage({
                        type: "Error",
                        title: this.getText("questionnaire.msg.saveError"),
                        description: oError?.message || ""
                    })
                }
            } finally {
                oView.setBusy(false)
            }
        },

        /**
         * Checks the fields of every visible Label with required="true": the input controls next to the label
         * (same VBox, or same table row). With app:requiredMode="any" on the Label, one filled field is enough.
         * Hidden (conditional) and disabled fields are ignored.
         * @returns {boolean} true when all required fields are filled
         */
        _validateRequiredFields() {
            const oView = this.getView()
            const aMissing = []

            oView.findAggregatedObjects(true, (oControl) => oControl.isA(FIELD_TYPES))
                .forEach((oField) => this._setFieldError(oField, false))

            oView.findAggregatedObjects(true, (oControl) => oControl.isA("sap.m.Label") && oControl.getRequired())
                .filter((oLabel) => this._isVisible(oLabel))
                .forEach((oLabel) => {
                    const aFields = oLabel.getParent().findAggregatedObjects(true, (oControl) => oControl.isA(FIELD_TYPES))
                        .filter((oField) => oField.getEnabled() && this._isVisible(oField))
                    const aEmpty = aFields.filter((oField) => this._isEmpty(oField))
                    const bAny = oLabel.data("requiredMode") === "any"

                    if (aEmpty.length && (!bAny || aEmpty.length === aFields.length)) {
                        const aErrorFields = bAny ? aEmpty.slice(0, 1) : aEmpty
                        aErrorFields.forEach((oField) => this._setFieldError(oField, true))
                        aMissing.push({ label: oLabel.getText(), field: aErrorFields[0] })
                    }
                })

            if (!aMissing.length) {
                return true
            }

            this.addMessage({
                type: "Error",
                title: this.getText("questionnaire.msg.requiredTitle", [aMissing.length]),
                description: aMissing.map((oMissing) => oMissing.label).join("\n")
            })
            this._focusField(aMissing[0].field)
            return false
        },

        _isVisible(oControl) {
            for (let oCurrent = oControl; oCurrent && oCurrent !== this.getView(); oCurrent = oCurrent.getParent()) {
                if (oCurrent.getVisible && !oCurrent.getVisible()) {
                    return false
                }
            }
            return true
        },

        _isEmpty(oField) {
            if (oField.isA("sap.m.RadioButtonGroup")) {
                return oField.getSelectedIndex() < 0
            }
            if (oField.isA("sap.m.Select")) {
                return !oField.getSelectedKey()
            }
            return !oField.getValue().trim()
        },

        // Marks the field in red until the user changes it
        _setFieldError(oField, bError) {
            oField.setValueState(bError ? "Error" : "None")
            oField.setValueStateText?.(bError ? this.getText("questionnaire.msg.requiredField") : "")
            if (bError) {
                const sEvent = oField.isA("sap.m.RadioButtonGroup") ? "select"
                    : oField.isA("sap.m.Select") || oField.isA("sap.m.DatePicker") ? "change" : "liveChange"
                oField.attachEventOnce(sEvent, () => this._setFieldError(oField, false))
            }
        },

        _focusField(oField) {
            let oSection = oField
            while (oSection && !oSection.isA("sap.uxap.ObjectPageSection")) {
                oSection = oSection.getParent()
            }
            if (oSection) {
                this.byId("questionnairePage").scrollToSection(oSection.getId())
            }
            setTimeout(() => oField.focus(), 500)
        },

        // submitChanges calls "success" even when a request inside the $batch fails, so the responses are checked here
        // Nothing is sent when the entity has no pending changes (e.g. a retry after Questionnaires_1 was already saved)
        _submitEntity(sName) {
            const oModel = this.getOwnerComponent().getModel()
            if (!oModel.getPendingChanges()[this._mContexts[sName].getPath().slice(1)]) {
                return Promise.resolve()
            }

            return new Promise((resolve, reject) => {
                oModel.submitChanges({
                    groupId: ENTITIES[sName].groupId,
                    success: (oData) => {
                        const oFailed = (oData?.__batchResponses || []).find((oResponse) => Number(oResponse.response?.statusCode) >= 400)
                        if (oFailed) {
                            reject(oFailed)
                        } else {
                            resolve(oData)
                        }
                    },
                    error: reject
                })
            })
        },

        navTo(sRoute) {
            this.getRouter().navTo(sRoute)
        },

    });
});
