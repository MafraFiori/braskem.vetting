sap.ui.define([
    "./Base.controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/core/Element",
    "sap/ui/core/Messaging",
    "sap/ui/core/Fragment",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/unified/FileUploaderParameter",
    "sap/m/library",
    "braskem/zui5vetting/model/fieldFormats",
    "braskem/zui5vetting/model/models"
], (BaseController, JSONModel, Element, Messaging, Fragment, Filter, FilterOperator, FileUploaderParameter, mobileLibrary,
    fieldFormats, models) => {
    "use strict";

    // The form reads two entities: q1> = Questionnaires_1Set (sections 1-6), q2> = Questionnaires_2Set (sections 7-13)
    // Each one has its own deferred group, because Questionnaires_2 can only be sent after the backend generates the IdQuest
    const ENTITIES = {
        // IdQuest is a placeholder, the backend replaces it with the generated number
        q1: { path: "/Questionnaires_1Set", entityType: "Questionnaires_1", groupId: "questionnaire1", properties: { IdQuest: "000000" } },
        q2: { path: "/Questionnaires_2Set", entityType: "Questionnaires_2", groupId: "questionnaire2", properties: {} }
    }

    // Route "RouteQuestionnaire" modes. A copy is a new questionnaire filled with the data of another one
    const MODE = {
        CREATE: "create",
        DISPLAY: "display",
        EDIT: "edit",
        COPY: "copy"
    }

    // Fields not copied to the new questionnaire (the backend fills them)
    const NOT_COPIED = ["__metadata", "IdQuest", "LoginOwner", "StatusQuest", "DtQuest", "HrQuest"]

    // StatusQuest values
    const STATUS = {
        DRAFT: "01",        // Em Edição
        SUBMITTED: "02"     // Enviado
    }

    // Controls checked by the required-field validation
    const FIELD_TYPES = ["sap.m.InputBase", "sap.m.Select", "sap.m.RadioButtonGroup"]

    // Files of the questionnaire (section 14). Deletes are sent at once (not deferred like the questionnaire changes)
    const FILES = { path: "/Questionnaires_filesSet", groupId: "files" }

    return BaseController.extend("braskem.zui5vetting.controller.Questionnaire", {

        onInit() {
            const oView = this.getView()
            const oModel = this.getOwnerComponent().getModel()

            // UI-only state, without a field in the entities
            oView.setModel(new JSONModel(), "form")

            oModel.setDeferredGroups([...oModel.getDeferredGroups(), ...Object.values(ENTITIES).map((oEntity) => oEntity.groupId)])
            // Changes of records that already exist (edit, or a draft saved again) go to the same group as the create
            oModel.setChangeGroups(Object.values(ENTITIES).reduce((mGroups, oEntity) => ({
                ...mGroups,
                [oEntity.entityType]: { groupId: oEntity.groupId }
            }), { "*": { groupId: "changes" } }))
            // Same ODataModel under two names, so each entity has its own binding context on the view
            Object.keys(ENTITIES).forEach((sName) => oView.setModel(oModel, sName))

            // Lengths / precision / scale of the fields from the service metadata
            fieldFormats.apply(oView, oModel, Object.fromEntries(Object.entries(ENTITIES).map(([sName, oEntity]) => [sName, oEntity.path.slice(1)])))

            // Opens the MessageView when an error / warning arrives (OData errors, save errors)
            this.attachMessages()

            // Template of the files table, bound per questionnaire in _bindFiles
            this._oFilesTemplate = this.byId("filesTable").getBindingInfo("items").template

            this._mContexts = {}
            this.getRouter().getRoute("RouteCreateQuestionnaires").attachPatternMatched(this.newObject, this)
            this.getRouter().getRoute("RouteQuestionnaire").attachPatternMatched(this._onQuestionnaireMatched, this)
        },

        onExit() {
            this.detachMessages()
        },

        newObject() {
            this._resetForm(MODE.CREATE)
            this._createEntries({})
        },

        // Display / edit an existing questionnaire, or copy it into a new one
        async _onQuestionnaireMatched(oEvent) {
            const { IdQuest: sIdQuest, mode: sMode } = oEvent.getParameter("arguments")
            if (![MODE.DISPLAY, MODE.EDIT, MODE.COPY].includes(sMode)) {
                this.navTo("RouteWelcome")
                return
            }

            const oView = this.getView()
            this._resetForm(sMode === MODE.COPY ? MODE.CREATE : sMode)
            Object.keys(ENTITIES).forEach((sName) => this._discardEntity(sName))

            oView.setBusy(true)
            try {
                const mContexts = await this._readEntities(sIdQuest)

                if (sMode === MODE.COPY) {
                    this._createEntries(Object.fromEntries(Object.entries(mContexts).map(([sName, oContext]) => {
                        const oData = { ...oContext.getObject() }
                        NOT_COPIED.forEach((sField) => delete oData[sField])
                        return [sName, oData]
                    })))
                } else {
                    Object.entries(mContexts).forEach(([sName, oContext]) => {
                        this._mContexts[sName] = oContext
                        oView.setBindingContext(oContext, sName)
                    })
                    this._bindFiles(sIdQuest)
                }
            } catch {
                // The reason was already added to the messages by the requestFailed handler
                this.navTo("RouteWelcome")
            } finally {
                oView.setBusy(false)
            }
        },

        _resetForm(sMode) {
            this.getView().getModel("form").setData({
                q5_2NotApplicable: false,
                editable: sMode !== MODE.DISPLAY,
                idQuest: ""     // IdQuest of a saved questionnaire: enables the files (section 14)
            })
            this._bindFiles("")
            Messaging.removeMessages(this._getValidationMessages())
            this.getView().findAggregatedObjects(true, (oControl) => oControl.isA(FIELD_TYPES))
                .forEach((oField) => this._setFieldError(oField, false))
            this.byId("questionnairePage").scrollToSection(this.byId("questionnairePage").getSections()[0]?.getId(), 0)
        },

        // New records (create / copy). mData: initial values per entity, e.g. { q1: {...}, q2: {...} }
        _createEntries(mData) {
            const oView = this.getView()
            const oModel = this.getOwnerComponent().getModel()

            return oModel.metadataLoaded().then(() => {
                Object.entries(ENTITIES).forEach(([sName, oEntity]) => {
                    this._discardEntity(sName)
                    this._mContexts[sName] = oModel.createEntry(oEntity.path, {
                        groupId: oEntity.groupId,
                        properties: { ...oEntity.properties, ...mData[sName] }
                    })
                    oView.setBindingContext(this._mContexts[sName], sName)
                })
            })
        },

        // Reads Questionnaires_1 and Questionnaires_2 of the IdQuest from the backend
        async _readEntities(sIdQuest) {
            const oModel = this.getOwnerComponent().getModel()
            await oModel.metadataLoaded()

            const aContexts = await Promise.all(Object.values(ENTITIES).map((oEntity) => new Promise((resolve, reject) => {
                const sPath = oModel.createKey(oEntity.path, { IdQuest: sIdQuest })
                oModel.createBindingContext(sPath, null, {}, (oContext) => (oContext ? resolve(oContext) : reject()), true)
            })))
            return Object.fromEntries(Object.keys(ENTITIES).map((sName, i) => [sName, aContexts[i]]))
        },

        // Throws away what was not saved for the entity: a new record not sent, or pending changes of an existing one
        _discardEntity(sName) {
            const oModel = this.getOwnerComponent().getModel()
            const oContext = this._mContexts[sName]
            if (!oContext) {
                return
            }
            if (oContext.isTransient()) {
                oModel.deleteCreatedEntry(oContext)
            } else {
                oModel.resetChanges([oContext.getPath()])
            }
            delete this._mContexts[sName]
        },

        onSaveDraft() {
            if (!this._validateFieldFormats()) {
                return
            }
            return this._save(STATUS.DRAFT)
        },

        onSaveSubmit() {
            if (!this._validateFieldFormats() || !this._validateRequiredFields()) {
                return
            }
            return this._save(STATUS.SUBMITTED)
        },

        // Errors of the field types (invalid number/date, too many digits) raised by the bindings (handleValidation)
        _getValidationMessages() {
            return Messaging.getMessageModel().getData().filter((oMessage) => oMessage.getType() === "Error"
                && oMessage.getMessageProcessor()?.isA("sap.ui.core.message.ControlMessageProcessor"))
        },

        /**
         * Blocks the save while a field has a value the backend would reject: type errors of the bindings
         * (e.g. more integer digits than the Edm.Decimal allows) and Select keys longer than the field (fieldFormats).
         * @returns {boolean} true when all field values are valid
         */
        _validateFieldFormats() {
            const aInvalid = this._getValidationMessages()
                .map((oMessage) => ({ field: Element.getElementById(oMessage.getControlIds()[0]), text: oMessage.getMessage() }))
                .filter((oInvalid) => oInvalid.field && this._isVisible(oInvalid.field))

            this.getView().findAggregatedObjects(true, (oControl) => oControl.isA("sap.m.Select") && oControl.data("maxLength"))
                .filter((oSelect) => oSelect.getSelectedKey().length > oSelect.data("maxLength"))
                .forEach((oSelect) => {
                    const sText = this.getText("questionnaire.msg.keyTooLong", [oSelect.getSelectedKey(), oSelect.data("maxLength")])
                    this._setFieldError(oSelect, true, sText)
                    aInvalid.push({ field: oSelect, text: sText })
                })

            if (!aInvalid.length) {
                return true
            }

            this.addMessage({
                type: "Error",
                title: this.getText("questionnaire.msg.invalidTitle", [aInvalid.length]),
                description: aInvalid.map((oInvalid) => `${this._getFieldLabel(oInvalid.field)}: ${oInvalid.text}`).join("\n")
            })
            this._focusField(aInvalid[0].field)
            return false
        },

        // Text of the Label next to the field (same VBox or table row)
        _getFieldLabel(oField) {
            for (let oParent = oField.getParent(); oParent && oParent !== this.getView(); oParent = oParent.getParent()) {
                const oLabel = oParent.findAggregatedObjects(false, (oControl) => oControl.isA("sap.m.Label"))[0]
                if (oLabel) {
                    return oLabel.getText()
                }
            }
            return ""
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
                if (!this.getView().getModel("form").getProperty("/idQuest")) {
                    this._bindFiles(sIdQuest)
                }

                if (oContext2.isTransient()) {
                    oModel.setProperty("IdQuest", sIdQuest, oContext2)
                }
                await this._submitEntity("q2")

                if (sStatus === STATUS.DRAFT) {
                    this.addMessage({ type: "Success", title: this.getText("questionnaire.msg.draftSaved", [sIdQuest]) })
                } else {
                    // The message stays in the messages button of the list
                    this.addMessage({ type: "Success", title: this.getText("questionnaire.msg.saveSuccess", [sIdQuest]) })
                    this.navTo("RouteWelcome")
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
        _setFieldError(oField, bError, sText = this.getText("questionnaire.msg.requiredField")) {
            oField.setValueState(bError ? "Error" : "None")
            oField.setValueStateText?.(bError ? sText : "")
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

        // ---- Section 14: files (Questionnaires_filesSet) ----

        // Lists the files of the questionnaire; without IdQuest (not saved yet) the table is empty
        _bindFiles(sIdQuest) {
            const oTable = this.byId("filesTable")
            this.getView().getModel("form").setProperty("/idQuest", sIdQuest)
            if (!sIdQuest) {
                oTable.unbindItems()
                return
            }
            oTable.bindItems({
                path: FILES.path,
                filters: [new Filter("IdQuest", FilterOperator.EQ, sIdQuest)],
                template: this._oFilesTemplate,
                templateShareable: true
            })
        },

        onAddDocument() {
            if (!this._pUploadDialog) {
                this._pUploadDialog = Fragment.load({
                    id: this.getView().getId(),
                    name: "braskem.zui5vetting.view.fragment.UploadDocumentDialog",
                    controller: this
                }).then((oDialog) => {
                    this.getView().addDependent(oDialog)
                    return oDialog
                })
            }
            this._pUploadDialog.then((oDialog) => {
                this.byId("uploadFiletype").setSelectedKey("").setValueState("None")
                this.byId("uploadDescription").setValue("")
                this.byId("uploadFile").clear().setValueState("None")
                oDialog.open()
            })
        },

        onCloseUploadDialog() {
            this.byId("uploadDocumentDialog").close()
        },

        /**
         * Sends the file as media (POST Questionnaires_filesSet, body = file content), handled by CREATE_STREAM.
         * The other fields go in the "slug" header: IdQuest|Filetype|Filename|Description, each one URI-encoded.
         */
        async onUploadDocument() {
            const oModel = this.getOwnerComponent().getModel()
            const oFiletype = this.byId("uploadFiletype")
            const oUploader = this.byId("uploadFile")

            oFiletype.setValueState(oFiletype.getSelectedKey() ? "None" : "Error")
            oUploader.setValueState(oUploader.getValue() ? "None" : "Error")
            if (!oFiletype.getSelectedKey() || !oUploader.getValue()) {
                return
            }

            const sSlug = [
                this.getView().getModel("form").getProperty("/idQuest"),
                oFiletype.getSelectedKey(),
                oUploader.getValue(),
                this.byId("uploadDescription").getValue()
            ].map(encodeURIComponent).join("|")

            oUploader.setUploadUrl(oModel.sServiceUrl + FILES.path)
            oUploader.destroyHeaderParameters()
            Object.entries({
                "x-csrf-token": await oModel.securityTokenAvailable(),
                slug: sSlug,
                Accept: "application/json"
            }).forEach(([sName, sValue]) => oUploader.addHeaderParameter(new FileUploaderParameter({ name: sName, value: sValue })))

            this.byId("uploadDocumentDialog").setBusy(true)
            oUploader.checkFileReadable()
                .then(() => oUploader.upload())
                .catch(() => {
                    this.byId("uploadDocumentDialog").setBusy(false)
                    oUploader.setValueState("Error")
                })
        },

        onUploadComplete(oEvent) {
            const iStatus = oEvent.getParameter("status")
            const sFilename = this.byId("uploadFile").getValue()
            this.byId("uploadDocumentDialog").setBusy(false)

            if (iStatus >= 200 && iStatus < 300) {
                this.addMessage({ type: "Success", title: this.getText("questionnaire.msg.documentUploaded", [sFilename]) })
                this.byId("uploadDocumentDialog").close()
                this.byId("filesTable").getBinding("items")?.refresh()
            } else {
                this.addMessage({
                    type: "Error",
                    title: this.getText("questionnaire.msg.documentUploadError", [sFilename]),
                    description: models.extractODataErrorMessage({
                        body: oEvent.getParameter("responseRaw"),
                        statusCode: iStatus
                    })
                })
            }
        },

        // GET_STREAM: the file content is at <entity>/$value
        onDownloadDocument(oEvent) {
            const oModel = this.getOwnerComponent().getModel()
            mobileLibrary.URLHelper.redirect(oModel.sServiceUrl + oEvent.getSource().getBindingContext().getPath() + "/$value", true)
        },

        onDeleteDocument(oEvent) {
            const oContext = oEvent.getSource().getBindingContext()
            const sFilename = oContext.getProperty("Filename")
            this.getOwnerComponent().getModel().remove(oContext.getPath(), {
                groupId: FILES.groupId,
                success: () => this.addMessage({ type: "Success", title: this.getText("questionnaire.msg.documentDeleted", [sFilename]) })
            })
        },

        navTo(sRoute) {
            this.getRouter().navTo(sRoute)
        },

    });
});
