sap.ui.define([
    "sap/ui/core/UIComponent",
    "braskem/zui5vetting/model/models"
], (UIComponent, models) => {
    "use strict";

    return UIComponent.extend("braskem.zui5vetting.Component", {
        metadata: {
            manifest: "json",
            interfaces: [
                "sap.ui.core.IAsyncContentCreation"
            ],
            config: { fullWidth: true }
        },

        init() {
            // call the base component's init function
            UIComponent.prototype.init.apply(this, arguments);

            // set the device model
            this.setModel(models.createDeviceModel(), "device");

            // enable routing
            this.getRouter().initialize();
        }
    });
});