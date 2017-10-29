// TwoBros Labs client-side image cropper. v4.20140310
// (c)20\d+ TwoBros Labs

function str(obj) { return JSON.stringify(obj); }

function getCookie(name) {
  var cookieValue = null;
  if (document.cookie && document.cookie != '') {
    var cookies = document.cookie.split(';');
    for (var i = 0; i < cookies.length; i++) {
      var cookie = jQuery.trim(cookies[i]);
      // Does this cookie string begin with the name we want?
      if (cookie.substring(0, name.length + 1) == (name + '=')) {
        cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
        break;
      }
    }
  }
  return cookieValue;
}

var TBLCropper = function(params) {
  /* TwoBros Labs self-contained client-side image cropper. Web and touchscreen friendly.

  Constructor parameters:
  {
    topdiv_id: string,  // Required. We build out the cropper HTML elements and append them to a div of your choice. Provide the ID.
    callback: function, // Optional. function to call with resulting base64 URL data (string) when crop button clicked. If not given no crop button shown and you must call crop() method to get URL.
    title: string,      // Optional. Text title to put at the top. HTML is acceptable.
    cropper_width: int, // Optional. Width of cropping window in pixels. default=300.
    final_width: int,   // Optional. Final desired output image width in pixels. default=800.
    zoom_steps: int,    // Optional. Number of possible zoom actions a user can take. ex: 20 means each zoom action will be 100%/20=5% of the possible zoom.
    move_steps: int,    // Optional. Number of possible move actions a user can take to scroll the whole image. ex: 20 means each move action will be 100%/20=5% of the possible movement.
    auto_rotate: int,   // Optional. Attempt to auto-rotate image based on its EXIF data? 1=yes (default), 0=no
    logging: enum,      // Optional. send all logging to: 'devnull' (default) ignore all errors/logging, 'popup' browser alert popups, 'console' browser console, <url> as JSON to given URL.
    loglevel: enum,     // Optional. 'off' (default), 'error', 'info', 'debug', 'trace'
  }

  Notes:
  (0) When the calling application has determined that the user is done making modifications the calling application must call the crop() method to return the final rendered image as a base64 data URL.
  (1) Following dependencies must already be loaded: JQuery (required), jquery.exif.js (optional if you want image EXIF support)
  (2) Only a square aspect ratio crop box is currently supported.
  (3) All cropper HTML elements will have class 'tblcropper' if you wish to style them.

  TODO:
  (1) make button styling configurable. caller passes in html elements.
  */

  var self = this;
  self.levels = {off:0, error:1, info:2, debug:3, trace:4}
  window.onerror = function(err, file, line) { self.log('error', 'window.onerror', file+' line# '+line+' --> '+err); }
  self.config = {
    topdiv_id: params.topdiv_id,
    callback: params.callback || null,
    title: params.title || '',
    cropper_width: params.cropper_width || 300,
    cropper_height: params.cropper_width || 300, // Currently only square aspect ratio supported.
    final_width: params.final_width || 800,
    final_height: params.final_width || 800,     // Currently only square aspect ratio supported.
    zoom_steps: params.zoom_steps || 10,
    move_steps: params.move_steps || 10,
    auto_rotate: params.auto_rotate || 1,
    logging: params.logging || 'devnull',
    loglevel: params.loglevel || 'off',
    downsample_multiple: 2.0,                    // Downsample all user images by this multiple of the cropper_width for better performance (esp on phones).
    img_type_filter: /^(?:image\/bmp|image\/cis\-cod|image\/gif|image\/ief|image\/jpeg|image\/jpeg|image\/jpeg|image\/pipeg|image\/png|image\/svg\+xml|image\/tiff|image\/x\-cmu\-raster|image\/x\-cmx|image\/x\-icon|image\/x\-portable\-anymap|image\/x\-portable\-bitmap|image\/x\-portable\-graymap|image\/x\-portable\-pixmap|image\/x\-rgb|image\/x\-xbitmap|image\/x\-xpixmap|image\/x\-xwindowdump)$/i,
  };

  // === init() ========================
  self.init = function() {
    self.data = {
      movex:0,         // Steps moved horizontally (x-axis). 0 means anchored to left side, positive values means steps moved to the right.
      movey:0,         // Steps moved vertically (y-axis). 0 means anchored to the top, positive values means steps moved down.
      zooms:0,         // Steps zoomed in. 0 means no zoom and positive numbers means steps of zoom.
      rotate:0,        // Clockwise rotate count. 0=no rotation, 1=90 degrees, 2=180, 3=270. This will be reset to zero after applied to original/hidden image.
      downsampled:0,   // To improve performance down size image. Code sets to 1 when its completed it so it happens once.
      userloaded:0,    // Count of times user has loaded an image.
      squishratio:1.0, // IOS6+ bug compensation. See self.detect_vertical_squish() method for more details. 1.0 is no skew, < 1.0 is skewed.
      imgw:0,          // Original image's width.
      imgh:0,          // Original image's height.
      imgtype:'',      // Original image's content type.
      imgsize:0,       // Original image's size in bytes.
      name:'',         // Original image's filename.
      orientation:0,   // Original image's EXIF (Orientation) rotate orientation. Top of image is: 0=undefined, 1=12oclock, 8=3oclock, 3=6oclock 6=9oclock
      exif:{},         // Original image's EXIF data.
      imgid:'_img_' + self.config.topdiv_id, // Original image's unique id.
    };
    self.topdiv = $('#'+self.config.topdiv_id);
    self.topdiv.html(self.config.title);
    self.btnfile = $('<input type="file" width="100px">');
    self.btnzin = $('<h3 style="display: inline;"><a href="#"><span class="glyphicon glyphicon-zoom-in"></span></a></h3>');
    self.btnzout = $('<h3 style="display: inline;"><a href="#"><span class="glyphicon glyphicon-zoom-out"></span></a></h3>');
    self.btncrop = $('<button class=tblcropper>CROP</button>');
    self.btnleft = $('<h3 style="display: inline;"><a href="#"><span class="glyphicon glyphicon-chevron-left"></span></a></h3>');
    self.btnright = $('<h3 style="display: inline;"><a href="#"><span class="glyphicon glyphicon-chevron-right"></span></a></h3>');
    self.btnup = $('<h3 style="display: inline;"><a href="#"><span class="glyphicon glyphicon-chevron-up"></span></a></h3>');
    self.btndown = $('<h3 style="display: inline;"><a href="#"><span class="glyphicon glyphicon-chevron-down"></span></a></h3>');
    self.btnrotate = $('<h3 style="display: inline;"><a href="#"><span class="glyphicon glyphicon-repeat"></span></a></h3>');
    self.imgo = $('<img id='+self.data.imgid+' class=tblcropper>').attr({src:''}).css({display:'none'}); // Holds user's full original image hidden from view.
    self.canvas = $('<canvas class=tblcropper>')
          .attr({
            width:self.config.cropper_width,
            height:self.config.cropper_height,
          })
          .css({
            'background-image':"url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAAHnlligAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAAHJJREFUeNpi+P///5EjRxiAGMgCCCAGFB5AADGCRBgYjh49CiRZIJS1tTWQBAggFBkmBiSAogxFBiCAoHogAKIKAlBUYTELAiAmEtABEECk20G6BOmuIl0CIMBQ/IEMkO0myiSSraaaBhZcbkUOs0HuBwARxT7aD6kRXAAAAABJRU5ErkJggg==')",
            'background-repeat':'repeat',
            'border':'',
            'margin':'5px 1px',
            'box-shadow':'inset 0 0 5px rgba(0, 0, 0, 0.5)',
          });

    var spacer = '&nbsp;&nbsp;';
    self.topdiv.append(self.btnfile, self.canvas, '<br>');
    self.topdiv.append(self.btnleft, spacer, self.btnup, spacer, self.btndown, spacer, self.btnright, spacer, self.btnrotate, spacer, self.btnzin, spacer, self.btnzout, '<br>');
    self.topdiv.append(self.btncrop, '<br>', self.imgo);

    self.btnfile.bind('change', self.load_file);
    self.btncrop.bind('click', self.crop);
    self.btnzout.bind('click', {zoom:'out'}, self.zoom);
    self.btnzin.bind('click', {zoom:'in'}, self.zoom);
    self.btnleft.bind('click', {move:'left'}, self.move);
    self.btnright.bind('click', {move:'right'}, self.move);
    self.btnup.bind('click', {move:'up'}, self.move);
    self.btndown.bind('click', {move:'down'}, self.move);
    self.btnrotate.bind('click', self.rotate_one);
    self.imgo.bind('load', self.imgo_onload);
    self.log('debug', 'init()', 'TBLCropper initialized with following config: '+str(self.config));

    if (self.config.callback == null) { self.btncrop.hide(); }
  };

  // === blit() ========================
  self.blit = function(canvas, canvas_width, canvas_height) {
      /* Clear the canvas and re-render the original image applying all user modifications in self.data.
         :param canvas: HTML DOM object, canvas to render the image to.
         :param canvas_width: integer, width of the canvas in pixels.
         :param canvas_height: integer, height of the canvas in pixels.
         :return: none, the canvas will be rendered to but nothing is returned. To get the image do this: canvas[0].toDataURL(<image content type>);
      */

      // Downsample: Sometimes images taken from smartphones are too big and crash the phone browser so lets resize down to twice the target size.
      if (self.data.downsampled == 0) {
        self.data.downsampled = 1; // Mark work complete.
        var downsample_width = self.config.downsample_multiple * self.config.final_width;
        if (self.data.imgw > downsample_width) {
          self.imgo.attr('src', self.image_resize(self.data.imgid, downsample_width, self.imgtype));
          return; // The image onload event handler calls this blit() method after setting the self.data attributes.
        }
      }

      // Rotate: If image rotation is unapplied to the original/hidden image do so now as it affects all the image width/height calculations.
      if (self.data.rotate > 0) {
        var degrees = 90 * self.data.rotate;
        self.data.rotate = 0; // Reset as we're applying it now.
        self.imgo.attr('src', self.image_rotate(self.data.imgid, degrees, self.imgtype));
        return; // The image onload event handler calls this blit() method after setting the self.data attributes.
      }

      // Render the image.
      // NOTE: For best browser compatibility manipulate image width and height, not canvas width and height, to control zoom and aspect ratio.
      var ctx = (canvas == undefined) ? self.canvas[0].getContext('2d') : canvas.getContext('2d');
      var target_width = (canvas_width == undefined) ? self.config.cropper_width : canvas_width;
      var target_height = (canvas_height == undefined) ? self.config.cropper_height : canvas_height;

      ctx.clearRect(0, 0, target_width, target_height); // Clear canvas, lets apply all current changes from scratch.

      var scale = 1 - (self.data.zooms / self.config.zoom_steps);
      var orig_imgw = self.data.imgw;
      var orig_imgh = self.data.imgh;

      if (orig_imgw >= orig_imgh) {
        // Landscape.
        var img_w = orig_imgw * scale;
        var img_h = Math.min(orig_imgh, img_w); // Continue to use max height untill aspect ratio is square (like canvas).
        var img_x = ((orig_imgw - img_w) / self.config.move_steps) * self.data.movex; // Move only whats off the screen.
        var img_y = ((orig_imgh - img_h) / self.config.move_steps) * self.data.movey;
        var can_w = target_width;
        var can_h = target_height * (img_h / img_w);
        var can_x = 0;
        var can_y = (target_height - can_h) / 2
      } else {
        // Portrait.
        var img_h = orig_imgh * scale;
        var img_w = Math.min(orig_imgw, img_h);
        var img_x = ((orig_imgw - img_w) / self.config.move_steps) * self.data.movex;
        var img_y = ((orig_imgh - img_h) / self.config.move_steps) * self.data.movey;
        var can_h = target_height;
        var can_w = target_width * (img_w / img_h);
        var can_y = 0;
        var can_x = (target_width - can_w) / 2
      }

      // Render it.
      if (self.is_debug()) {
        var params = {scale:scale, img_x:img_x, img_y:img_y, img_w:img_w, img_h:img_h, can_x:can_x, can_y:can_y, can_w:can_w, can_h:can_h};
        self.log('trace', 'blit()', '-----> rendering image. variables:'+ str(params) +' self.data:'+ str(self.data) +' config:'+ str(self.config));
      }
      ctx.drawImage(self.imgo[0], img_x, img_y, img_w, img_h, can_x, can_y, can_w, can_h); 
  }

  // === zoom() ========================
  self.zoom = function(evt) {
    evt.preventDefault();
    if (evt.data.zoom == 'out') { self.data.zooms = Math.max(self.data.zooms - 1, 0); }
    if (evt.data.zoom == 'in')  { self.data.zooms = Math.min(self.data.zooms + 1, self.config.zoom_steps - 1); }
    self.blit();
  };

  // === move() ========================
  self.move = function(evt) {
    evt.preventDefault();
    if (evt.data.move == 'right'){ self.data.movex = Math.min(self.data.movex + 1, self.config.move_steps); }
    if (evt.data.move == 'left') { self.data.movex = Math.max(self.data.movex - 1, 0); }
    if (evt.data.move == 'down') { self.data.movey = Math.min(self.data.movey + 1, self.config.move_steps); }
    if (evt.data.move == 'up')   { self.data.movey = Math.max(self.data.movey - 1, 0); }
    self.blit();
  };

  // === rotate_one() ==================
  self.rotate_one = function(evt) {
    evt.preventDefault();
    self.data.rotate += 1;
    if (self.data.rotate > 3) {
      self.data.rotate = 0;
    }
    self.blit();
  };

  // === crop() ========================
  // The calling code should call this method to get their final cropped image.
  // This function return returns a string that is the cropped images in data URL format with all user modifications applied.
  // If called directly the data URL is returned directly. If a callback was given to the constructor that will be called.
  // A null string will be returned if the user has not loaded an image.
  self.crop = function() {
    if (self.data.userloaded < 1) {
      return '';
    }
    canvas = $('<canvas class=tblcropper>').attr({width:self.config.final_width, height:self.config.final_height})
    self.blit(canvas[0], self.config.final_width, self.config.final_height);
    url = canvas[0].toDataURL(self.data.imgtype);
    self.log('trace', 'crop()', 'url -> '+url);
    if (self.config.callback != null) { self.config.callback(url); }
    return url;
  };

  // === load_file() ===================
  self.load_file = function(evt) {
    if (this.files.length < 1) { return; }
    if (self.is_debug()) { self.imgo.hide(); }
    file = this.files[0]; // .type, .name, .size
    fileinfo = file.size +'|'+ file.type +'|'+ file.name;
    if (! self.config.img_type_filter.test(file.type)) {
      self.log('info', 'load_file()', 'Invalid file: '+fileinfo);
      self.user_alert('load_file()', 'Invalid File Type: '+file.type);
      return;
    }
    self.data.imgsize = file.size;
    self.data.name = file.name;
    self.data.imgtype = file.type;
    self.data.zooms = 0;
    self.data.movex = 0;
    self.data.movey = 0;
    self.data.rotate = 0;
    self.data.downsampled = 0;
    self.data.userloaded += 1;

    // Detect image orientation for auto-rotate.
    try {
      $(this).fileExif(function(exifobj) {
        exifobj.MakerNote = [];
        exifobj.UserComment = [];
        self.data.exif = exifobj;
        self.data.orientation = exifobj.Orientation || 0;
        self.log('info', 'load_file()', 'Valid file: '+ JSON.stringify(self.data));

        // Auto-rotate.
        rotation_map = {6:1, 3:2, 8:3}; // EXIF orientation code to count of 90 degree clockwise rotation count.
        if (self.data.orientation in rotation_map && self.config.auto_rotate > 0) {
          self.data.rotate = rotation_map[self.data.orientation];
        }
      });
    } catch(err) {
      self.data.exif = {'error':'fileExif() method does not exist! jquery.exif.js not loaded.'};
      self.log('info', 'load_file()', 'Valid file: '+ JSON.stringify(self.data));
    }

    // Read the file into memory.
    reader = new window.FileReader();
    reader.onload = function(evt) {
      url = evt.target.result; // Base64 format. ex: "data:image/jpeg;base64,/9j/4AAQSkZJRgA ... //ZCg=="
      self.imgo.attr('src', url); // Goto self.imgo_onload().
    }
    reader.readAsDataURL(file); // Goto reader.onload().
  };

  // Pulling logic into event handler so doesn't run before image fully loaded.
  self.imgo_onload = function() {
    if (self.is_debug()) { self.imgo.show(); }
    self.data.imgw = self.imgo[0].width; // imgo.width() doesnt work for in-memory images on some browsers so use raw javascript.
    self.data.imgh = self.imgo[0].height;

    // Get the squish ratio. Benign operation is not an iphone.
    self.data.squishratio = self.detect_vertical_squish(self.imgo[0]);

    // And finally - render the image into the canvas with all of its self.data modifiers honored.
    try {
      self.blit();
    } catch (e) {
      // Ugly hack to work around firefox bug which allows this code to run before image is fully loaded.
      // See http://stackoverflow.com/questions/18580844/firefox-drawimagevideo-fails-with-ns-error-not-available-component-is-not-av
      if (e.name == "NS_ERROR_NOT_AVAILABLE") {
        setTimeout(self.blit, 100);
      } else {
        throw e;
      }
    }
  };

  // === helper functions ==============

  self.image_rotate = function(img_id, degrees, img_type) {
    /* image_rotate() returns a rotated image data URL.

    :param img_id: required string, the HTML element id of the image to rotate. Note this image will not be modified.
    :param degrees: optional int, degrees clockwise to rotate. valid values: 90, 180, 270. default=90.
    :param img_type: optional string, new image content type. default: image/jpeg.
    :return: string, rotated image in data URL format.
    */
    if (degrees != 90 && degrees != 180 && degrees != 270) { degrees = 90; }
    img_type = img_type || 'image/jpeg';

    var imgo = $('#'+img_id);
    var w = imgo.width();
    var h = imgo.height();
    var landscape = w >= h;
    var can_w = (degrees == 180) ? w : h;
    var can_h = (degrees == 180) ? h : w;
    self.log('debug', 'image_rotate()', str({degrees:degrees, w:w, h:h, landscape:landscape, can_w:can_w, can_h:can_h}));

    var canvas = $('<canvas>').attr({width:can_w, height:can_h});
    var ctx = canvas[0].getContext('2d');
    // translate() rotates our coordinate system so when we draw itll be rendered according to it.
    if (degrees < 91) {
      ctx.translate(h, 0);
    } else if (degrees < 181) {
      ctx.translate(w, h);
    } else if (degrees < 271) {
      ctx.translate(0, w);
    } else {
      ctx.translate(0, 0);
    }
    ctx.rotate(degrees * Math.PI / 180);
    ctx.drawImage(imgo[0], 0, 0);

    return canvas[0].toDataURL(img_type);
  }

  self.user_alert = function(caller, msg) {
    alert('TBLCropper->'+ caller +': '+ msg);
  };

  self.image_resize = function(img_id, new_width, img_type) {
    /* image_resize() returns a resized (and corrected) version of the given image.

    :param img_id: required string, the HTML element id of the image to resize. Note this image will not be modified.
    :param new_width: required integer, width of the resized image. Height will be calculated according to the aspect ratio.
    :param img_type: optional string, new image content type. image/jpeg will be used if not given. ex: image/png.
    :return: string, resized image in data URL format.
    */
    imgo = $('#'+img_id);
    var w = imgo.width();
    var h = imgo.height();
    new_width = Math.floor(new_width); // to int.
    var new_height = Math.floor((new_width / w) * h);
    var data_w = w; // How much of the image data width to render from the original image.
    var data_h = h; 

    // IOS6+ bug: squishes the all image data into the top of the image space. Ajust accordingly if squish detected.
    // See detect_vertical_squish() for more info.
    var sr = self.data.squishratio;
    if (sr < 1.0) {
      var data_w = w;
      var data_h = h * sr;
      if (self.data.orientation == 6 || self.data.orientation == 8) {
        // Correct orientation.
        var x = new_width;
        new_width = new_height;
        new_height = x;
      }
    }

    self.log('debug', 'image_resize()', str({orig_dimensions: w+'x'+h, new_dimensions: new_width+'x'+new_height, 'self.data': self.data}));

    canvas = $('<canvas>').attr({width:new_width, height:new_height});
    ctx = canvas[0].getContext('2d');
    ctx.drawImage(imgo[0], 0, 0, data_w, data_h, 0, 0, new_width, new_height);
    return canvas[0].toDataURL(img_type || 'image/jpeg');
  }

  self.detect_vertical_squish = function(img) {
    /* Known IOS6+safari bug that squishes image vertically if > 1MB image.
    http://stackoverflow.com/questions/11929099/html5-canvas-drawimage-ratio-bug-ios

    "restriction which resides in iOS Safari resource limitation. According to [Apple], JPEG files over 2M pixels will be subsampled."
    http://stackoverflow.com/questions/12554947/mobile-safari-renders-img-src-dataimage-jpegbase64-scaled-on-canvas/12615436#12615436

    Images look like this:
    Orientation: 1 (0 degrees)          6 (90 degrees)       3 (180 degrees)                     8 (270 degrees)
    +---------------------------------+ +------------------+ +---------------------------------+ +------------------+
    |                                 | |                  | |                                 | |                  |
    |                O                | |       |          | |                v                | |         |        |
    |               ---               | |      O|--<       | |                |                | |      >--|O       |
    |                |                | |       |          | |               ---               | |         |        |
    |                ^                | |..................| |                O                | |..................|
    |.................................| |                  | |.................................| |                  |
    |                                 | |                  | |                                 | |                  |
    |                                 | |                  | |                                 | |                  |
    |           b l a c k             | |                  | |           b l a c k             | |                  |
    |                                 | |    b l a c k     | |                                 | |    b l a c k     |
    +---------------------------------+ |                  | +---------------------------------+ |                  |
                                        |                  |                                     |                  |
                                        |                  |                                     |                  |
                                        |                  |                                     |                  |
                                        |                  |                                     |                  |
                                        +------------------+                                     +------------------+
    */
    var iw = img.naturalWidth, ih = img.naturalHeight;
    var canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = ih;
    var ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    var data = ctx.getImageData(0, 0, 1, ih).data;

    // search image edge pixel position in case it is squashed vertically.
    var sy = 0;
    var ey = ih;
    var py = ih;
    while (py > sy) {
      var alpha = data[(py - 1) * 4 + 3];
      if (alpha === 0) {
          ey = py;
      } else {
          sy = py;
      }
      py = (ey + sy) >> 1;
    }
    var ratio = (py / ih);

    return (ratio===0) ? 1 : ratio;
  }

  self.log = function(level, caller, msg) {
    /*
    :param level: string, error, info, debug, or trace.
    :param caller: string, your function or component name for identification purposes.
    :param msg: string, your log message to post.
    */
    if (self.levels[level] <= self.levels[self.config.loglevel] && self.config.logging != 'devnull') {
      if (self.config.logging == 'popup') { 
        self.user_alert(caller, msg);
      } else if (self.config.logging == 'console') { 
        console.log(caller +': '+ msg);
      } else {
        $.ajax({
          type: 'post',
          contentType: 'text/plain',
          beforeSend: function(xhr) { xhr.setRequestHeader("X-CSRFToken", getCookie('csrftoken')); }, // If django.
          async: true,
          url: self.config.logging,
          data: str({level:level, caller:caller, message:msg}),
          error: function(resp) { console.log('self.log() ajax logging error: '+ str(resp)); },
        });
      }
    }
  }

  self.is_debug = function() { return self.levels[self.config.loglevel] >= self.levels['debug']; }

  self.init();
}

/*
PLATFORM TESTING:
+----------------------------------------------------------------------------------------------------------------------------+
| date     | OS                 | Browser             | Result | Note                                                        |
+----------------------------------------------------------------------------------------------------------------------------+
| 20140105D| win xp             | chrome 31.0.1650.63 | pass   | platform developed on                                       |
| 20140105D| win xp             | firefox 25.0.1      | fixed  | "NS_ERROR_NOT_AVAILABLE" bug fixed when calling drawImage() |
| 20140105D| win xp             | safari 5.1.7        |FAIL    | window.FileReader not supported. newer version not available for old winXP.
| 20140306D| android 4.3        | chrome 31.0.1650.59 | fixed  | 
| 20140105D| android 4.3        | built in browser    | pass   | 
| 20140306D| iphone 5c, IOS 7.0 | safari              |USABLE  | post-squishratio-fix: landscape looks good but portrait shots look stretched. small (1MB) images look fine.
| 20140306D| iphone 5c, IOS 7.0 | chrome              |USABLE  | same as safari. outstanding is an IOS issue.
| 20140108A| mac os v10.8.5     | chrome              | pass   | 
| 20140108A| mac os v10.8.5     | firefox             | pass   | 
| 20140108A| mac os v10.8.5     | safari              | fixed  | zoom worked but up/down/left/right didnt.
| 20140129D| win 8              | chrome 32.0.        | pass   | 
| 20140129D| win 8              | firefox 24.0        | fixed  | move when zoomed stretches image doesnt move it
| 20140129D| win 8              | firefox 26.0        | fixed  | move when zoomed stretches image doesnt move it
| 20140203A| iphone 5, IOS 7.0  | chrome              |FAIL    | sideways and squished but stretched out better as zoomed. crop was correct but sideways. debug image below was correct orientation.
| 20140203A| iphone 5, IOS 7.0  | safari              |FAIL    | sideways and squished but stretched out better as zoomed. crop was correct but sideways. debug image below was correct orientation.
+----------------------------------------------------------------------------------------------------------------------------+
date: D=dave, A=aaron

No window.fileReader workaround: ajax upload file to server side who base64 encodes and sends back:
http://stackoverflow.com/questions/5392344/sending-multipart-formdata-with-jquery-ajax
*/
